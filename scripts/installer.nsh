!include 'MUI2.nsh'
!include 'StrFunc.nsh'
!include 'LogicLib.nsh'
!include 'nsDialogs.nsh'
!include 'WinMessages.nsh'

# Define allowToChangeInstallationDirectory to show the directory page
!define allowToChangeInstallationDirectory

# Per-user install
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

# Custom finish page that skips when in update mode
!macro customFinishPage
  !ifndef HIDE_RUN_AFTER_FINISH
    Function StartApp
      ${if} ${isUpdated}
        StrCpy $1 "--updated"
      ${else}
        StrCpy $1 ""
      ${endif}
      ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
    FunctionEnd

    !define MUI_FINISHPAGE_RUN
    !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  !endif

  !define MUI_PAGE_CUSTOMFUNCTION_PRE FinishPagePreCheck
  !insertmacro MUI_PAGE_FINISH

  # Skip finish page during updates
  Function FinishPagePreCheck
    ${if} ${isUpdated}
      ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "--updated"
      Abort
    ${endif}
  FunctionEnd
!macroend

!ifdef BUILD_UNINSTALLER
  # Default to showing details in uninstaller InstFiles page
  ShowUninstDetails show
!endif

# Utility: Capture current NSIS reboot flag into a variable ("0" or "1")
!macro GET_REBOOTFLAG_TO_VAR _outVar
  !define _LBL_SET "rf_set_${__LINE__}"
  !define _LBL_DONE "rf_done_${__LINE__}"

  StrCpy ${_outVar} "0"
  IfRebootFlag ${_LBL_SET}
  Goto ${_LBL_DONE}
  ${_LBL_SET}:
    StrCpy ${_outVar} "1"
  ${_LBL_DONE}:

  !undef _LBL_SET
  !undef _LBL_DONE
!macroend

# Wrapper: RMDir with logging + reboot detection (prints to details)
# Usage: !insertmacro RMDIR_LOGGED "<path>" "<friendly label>"
!macro RMDIR_LOGGED _path _description
  Push $0
  Push $1
  Push $2
  Push $3

  # Capture previous reboot flag state
  !insertmacro GET_REBOOTFLAG_TO_VAR $0

  # Reset flag to detect if this call sets it (schedule-on-reboot)
  DetailPrint "Removing ${_description}: ${_path}"
  SetRebootFlag false
  ClearErrors
  RMDir /r /REBOOTOK "${_path}"

  ${If} ${Errors}
    DetailPrint "[Error] Failed to remove ${_description}: ${_path}"
  ${Else}
    !insertmacro GET_REBOOTFLAG_TO_VAR $2
    ${If} $2 == "1"
      DetailPrint "[Reboot] Scheduled removal of ${_description}: ${_path}"
    ${Else}
      DetailPrint "[OK] Removed ${_description}: ${_path}"
    ${EndIf}
  ${EndIf}

  # Restore reboot flag to (prev OR new)
  ${If} $0 == "1"
  ${OrIf} $2 == "1"
    SetRebootFlag true
  ${EndIf}

  Pop $3
  Pop $2
  Pop $1
  Pop $0
!macroend

# Centralized strings, to be converted to i18n when practical
!define TITLE_CHOOSE         "Choose what to remove"
!define DESC_STANDARD        "Standard uninstall removes the app itself, its managed python packages, and some settings only for the desktop app. It does not remove model files or content that was created."
!define DESC_CUSTOM          "Custom allows you to select which components to uninstall. The detected install path is:"
!define LABEL_STANDARD       "Standard"
!define LABEL_CUSTOM         "Custom"
!define LABEL_APPDATA        "Delete logs and Desktop settings"
!define LABEL_VENV           "Remove the ComfyUI Python virtual environment (.venv)"
!define LABEL_UPDATECACHE    "Remove any temporary update files"
!define LABEL_RESETSETTINGS  "Reset ComfyUI settings (comfy.settings.json)"
!define LABEL_BASEPATH       "Completely delete ComfyUI Path - all models, created content, etc"
!define LABEL_COMFYUI_PATH   "ComfyUI Path"
!define LABEL_NOT_FOUND      "Not found"
!define LABEL_CONFIRM_DELETE "Yes, delete the ComfyUI Folder"

# The following is used to add the "/SD" flag to MessageBox so that the
# machine can restart if the uninstaller fails.
!macro customUnInstallCheckCommon
  IfErrors 0 +3
  DetailPrint `Uninstall was not successful. Not able to launch uninstaller!`
  Return

  ${if} $R0 != 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(uninstallFailed): $R0" /SD IDOK
    DetailPrint `Uninstall was not successful. Uninstaller error code: $R0.`
    SetErrorLevel 2
    Quit
  ${endif}
!macroend

!macro customUnInstallCheck
  !insertmacro customUnInstallCheckCommon
!macroend

!macro customUnInstallCheckCurrentUser
  !insertmacro customUnInstallCheckCommon
!macroend

!macro customRemoveFiles
  ${ifNot} ${isUpdated}
    ClearErrors
    FileOpen $0 "$APPDATA\Artify\extra_models_config.yaml" r
    var /global line
    var /global lineLength
    var /global prefix
    var /global prefixLength
    var /global prefixFirstLetter

# Resolve basePath at uninstaller startup
!macro customUnInit
  Call un.ResolveBasePath
!macroend

# Insert custom pages: options, then conditional confirmation
!macro customUnWelcomePage
  !insertmacro MUI_UNPAGE_WELCOME
  UninstPage custom un.ExtraUninstallPage_Create un.ExtraUninstallPage_Leave
  UninstPage custom un.ConfirmDeleteBasePath_Create un.ConfirmDeleteBasePath_Leave
!macroend

!ifdef BUILD_UNINSTALLER
  ${UnStrRep}

  Var /GLOBAL basePath

  Var /GLOBAL descLabel
  Var /GLOBAL basePathLabel

  Var /GLOBAL radioRemoveStandard
  Var /GLOBAL radioRemoveCustom

  Var /GLOBAL isDeleteComfyUI
  Var /GLOBAL chkDeleteComfyUI
  Var /GLOBAL isDeleteBasePath
  Var /GLOBAL chkDeleteBasePath
  Var /GLOBAL isDeleteUpdateCache
  Var /GLOBAL chkDeleteUpdateCache
  Var /GLOBAL isResetSettings
  Var /GLOBAL chkResetSettings
  Var /GLOBAL isDeleteVenv
  Var /GLOBAL chkDeleteVenv
  Var /GLOBAL confirmCheckbox

  # Create uninstall options page
  Function un.ExtraUninstallPage_Create
    !insertmacro MUI_HEADER_TEXT "${TITLE_CHOOSE}" ""

    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}

    # Description label (default Standard)
    ${NSD_CreateLabel} 0 0 100% 24u "${DESC_STANDARD}"
    Pop $descLabel

    ${NSD_CreateRadioButton} 0 24u 100% 12u "${LABEL_STANDARD}"
    Pop $radioRemoveStandard
    ${NSD_CreateRadioButton} 0 40u 100% 12u "${LABEL_CUSTOM}"
    Pop $radioRemoveCustom
    ${NSD_SetState} $radioRemoveStandard 1
    ${NSD_OnClick} $radioRemoveStandard un.PresetFull_OnClick
    ${NSD_OnClick} $radioRemoveCustom un.PresetCustom_OnClick

    ${NSD_CreateCheckBox} 8u 54u 100% 12u "${LABEL_APPDATA}"
    Pop $chkDeleteComfyUI
    StrCpy $isDeleteComfyUI "1"
    ${NSD_SetState} $chkDeleteComfyUI 1
    ${NSD_OnClick} $chkDeleteComfyUI un.Desc_ComfyData

    ${NSD_CreateCheckBox} 8u 68u 100% 12u "${LABEL_UPDATECACHE}"
    Pop $chkDeleteUpdateCache
    StrCpy $isDeleteUpdateCache "1"
    ${NSD_SetState} $chkDeleteUpdateCache 1
    ${NSD_OnClick} $chkDeleteUpdateCache un.Desc_UpdateCache

    ${NSD_CreateCheckBox} 8u 82u 100% 12u "${LABEL_VENV}"
    Pop $chkDeleteVenv
    StrCpy $isDeleteVenv "1"
    ${NSD_SetState} $chkDeleteVenv 1
    ${NSD_OnClick} $chkDeleteVenv un.Desc_Venv

    ${NSD_CreateCheckBox} 8u 96u 100% 12u "${LABEL_RESETSETTINGS}"
    Pop $chkResetSettings
    StrCpy $isResetSettings "0"
    ${NSD_SetState} $chkResetSettings 0
    ${NSD_OnClick} $chkResetSettings un.Desc_ResetSettings

    ${NSD_CreateCheckBox} 8u 110u 100% 12u "${LABEL_BASEPATH}"
    Pop $chkDeleteBasePath
    StrCpy $isDeleteBasePath "0"
    ${NSD_SetState} $chkDeleteBasePath 0
    ${NSD_OnClick} $chkDeleteBasePath un.Desc_BasePath

    # ComfyUI Path
    ${If} $basePath != ""
      StrCpy $1 "${LABEL_COMFYUI_PATH}: $basePath"
    ${Else}
      StrCpy $1 "${LABEL_COMFYUI_PATH}: ${LABEL_NOT_FOUND}"
    ${EndIf}

    ${NSD_CreateLabel} 0 126u 100% 12u "$1"
    Pop $basePathLabel

    # Disable checkboxes if basePath is not found
    ${If} $basePath == ""
      EnableWindow $chkResetSettings 0
      EnableWindow $chkDeleteVenv 0
      EnableWindow $chkDeleteBasePath 0
      ${NSD_SetState} $chkResetSettings 0
      ${NSD_SetState} $chkDeleteVenv 0
      ${NSD_SetState} $chkDeleteBasePath 0
    ${EndIf}

    # Hide all checkboxes by default (shown when Custom is selected)
    Push 0
    Call un.SetCheckboxesVisible

    nsDialogs::Show
  FunctionEnd

  Function un.SetCheckboxesVisible
    Exch $0
    ${If} $0 == 0
      ShowWindow $chkDeleteComfyUI ${SW_HIDE}
      ShowWindow $chkDeleteUpdateCache ${SW_HIDE}
      ShowWindow $chkResetSettings ${SW_HIDE}
      ShowWindow $chkDeleteVenv ${SW_HIDE}
      ShowWindow $chkDeleteBasePath ${SW_HIDE}
    ${Else}
      ShowWindow $chkDeleteComfyUI ${SW_SHOW}
      ShowWindow $chkDeleteUpdateCache ${SW_SHOW}
      ${If} $basePath != ""
        ShowWindow $chkResetSettings ${SW_SHOW}
        ShowWindow $chkDeleteVenv ${SW_SHOW}
        ShowWindow $chkDeleteBasePath ${SW_SHOW}
      ${EndIf}
    ${EndIf}
    Pop $0
  FunctionEnd

    FileClose $0
    Delete "$APPDATA\Artify\extra_models_config.yaml"
    Delete "$APPDATA\Artify\config.json"
  ${endIf}
!macroend
