!include 'LogicLib.nsh'

; The following is used to add the "/SD" flag to MessageBox so that the
; machine can restart if the uninstaller fails.
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
    FileOpen $0 "$APPDATA\artify\extra_models_config.yaml" r
    var /global line
    var /global lineLength
    var /global prefix
    var /global prefixLength
    var /global prefixFirstLetter

    FileRead $0 $line

    StrCpy $prefix "base_path: " ; Space at the end is important to strip away correct number of letters
    StrLen $prefixLength $prefix
    StrCpy $prefixFirstLetter $prefix 1
    
    StrCpy $R3 $R0
    StrCpy $R0 -1
    IntOp $R0 $R0 + 1
    StrCpy $R2 $R3 1 $R0
    StrCmp $R2 "" +2
    StrCmp $R2 $R1 +2 -3
  
    StrCpy $R0 -1

    ${DoUntil} ${Errors}
      StrCpy $R3 0 ; Whitespace padding counter
      StrLen $lineLength $line

      ${Do} ; Find first letter of prefix
          StrCpy $R4 $line 1 $R3

          ${IfThen} $R4 == $prefixFirstLetter ${|} ${ExitDo} ${|}
          ${IfThen} $R3 > $lineLength ${|} ${ExitDo} ${|}

          IntOp $R3 $R3 + 1
      ${Loop}

      StrCpy $R2 $line $prefixLength $R3 ; Copy part from first letter to length of prefix

      ${If} $R2 == $prefix
        StrCpy $2 $line 1024 $R3 ; Strip off whitespace padding
        StrCpy $3 $2 1024 $prefixLength ; Strip off prefix

        ; $3 now contains value of base_path
        RMDir /r /REBOOTOK "$3\.venv"
        RMDir /r /REBOOTOK "$3\uv-cache"

        ${ExitDo} ; No need to continue, break the cycle
      ${EndIf}
      FileRead $0 $line
    ${LoopUntil} 1 = 0

    FileClose $0
    RMDir /r "$APPDATA\artify"

    ; 删除 $EXEDIR 下除自身以外的所有文件和文件夹
    Push $R0
    Push $R1
    Push $R2
    StrCpy $R0 "$EXEDIR"
    FindFirst $R1 $R2 "$R0\*.*"
    ${DoWhile} $R1 != 0
      StrCmp "$R0\$R2" "$EXEPATH" skip_delete
        IfFileExists "$R0\$R2\*.*" 0 +3
          RMDir /r "$R0\$R2"
          Goto next_item
        Delete "$R0\$R2"
      skip_delete:
      next_item:
      FindNext $R1 $R2
    ${Loop}
    FindClose $R1
    Pop $R2
    Pop $R1
    Pop $R0

    ; 删除自身（重启后）
    Delete /REBOOTOK "$EXEPATH"
  ${endIf}
!macroend