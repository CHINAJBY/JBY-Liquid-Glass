#ifndef AppVersion
  #define AppVersion "3.2.0"
#endif
#ifndef StageRoot
  #define StageRoot "..\dist-stage"
#endif
#ifndef OutputDir
  #define OutputDir "..\dist"
#endif

#define AppName "JBY Liquid Glass"
#define AppPublisher "JBY Liquid Glass"
#define AppExeName "JBYLiquidGlass.exe"
#define PersistentPowerShellPath "{win}\System32\WindowsPowerShell\v1.0\powershell.exe"
#define PowerShellPath "{sysnative}\WindowsPowerShell\v1.0\powershell.exe"

[Setup]
AppId={{8F91D2D0-5F3C-4E12-B8B1-A342E97A1B10}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} v{#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={localappdata}\Programs\JBYLiquidGlass
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
WizardStyle=modern
Compression=lzma2/ultra64
SolidCompression=yes
OutputDir={#OutputDir}
OutputBaseFilename=JBYLiquidGlass-Setup-v{#AppVersion}
SetupIconFile={#StageRoot}\payload\assets\jby-liquid-glass.ico
UninstallDisplayIcon={app}\payload\assets\jby-liquid-glass.ico
UninstallDisplayName={#AppName}
CloseApplications=no
RestartApplications=no
MinVersion=10.0

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "startup"; Description: "Start JBY Liquid Glass in system tray at login"; GroupDescription: "Additional options:"; Flags: checkedonce

[Files]
Source: "{#StageRoot}\JBYLiquidGlass.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#StageRoot}\setup-bootstrap.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#StageRoot}\payload\*"; DestDir: "{app}\payload"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\JBY Liquid Glass"; Filename: "{app}\{#AppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\payload\assets\jby-liquid-glass.ico"
Name: "{userdesktop}\JBY Liquid Glass"; Filename: "{app}\{#AppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\payload\assets\jby-liquid-glass.ico"
Name: "{userstartup}\JBY Liquid Glass"; Filename: "{#PersistentPowerShellPath}"; Parameters: "-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File ""{app}\setup-bootstrap.ps1"" -LaunchTray"; WorkingDir: "{app}"; IconFilename: "{app}\payload\assets\jby-liquid-glass.ico"; Tasks: startup

[Run]
Filename: "{#PowerShellPath}"; Parameters: "-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File ""{app}\setup-bootstrap.ps1"" -Install -LaunchTray -Silent"; WorkingDir: "{app}"; Flags: runhidden waituntilterminated
Filename: "{app}\{#AppExeName}"; Description: "Launch JBY Liquid Glass"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{#PowerShellPath}"; Parameters: "-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File ""{app}\setup-bootstrap.ps1"" -Uninstall -Silent"; WorkingDir: "{app}"; Flags: runhidden waituntilterminated
