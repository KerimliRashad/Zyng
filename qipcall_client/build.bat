@echo off
REM Сборка JeffTUN.exe на своём компьютере (нужен Python 3.10+)
echo === JeffTUN build ===

echo [1/3] Ставлю PyInstaller...
pip install pyinstaller

echo [2/3] Скачиваю ядро xray...
powershell -Command "Invoke-WebRequest -Uri 'https://github.com/XTLS/Xray-core/releases/latest/download/Xray-windows-64.zip' -OutFile 'xray.zip'; Expand-Archive -Path 'xray.zip' -DestinationPath 'xray_bin' -Force; Copy-Item 'xray_bin\xray.exe' 'xray.exe' -Force"

echo [3/3] Собираю EXE...
pyinstaller --noconfirm --onefile --windowed --name "JeffTUN" --icon "icon.ico" --add-binary "xray.exe;." --add-data "logo_white.png;." --add-data "icon.ico;." qipcall.py

echo.
echo Готово! Файл: dist\JeffTUN.exe
pause
