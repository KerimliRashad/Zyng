@echo off
REM Сборка JeffTON.exe на своём компьютере (нужен Python 3.10+)
echo === JeffTON build ===

echo [1/3] Ставлю PyInstaller...
pip install pyinstaller

echo [2/3] Скачиваю ядро xray...
powershell -Command "Invoke-WebRequest -Uri 'https://github.com/XTLS/Xray-core/releases/latest/download/Xray-windows-64.zip' -OutFile 'xray.zip'; Expand-Archive -Path 'xray.zip' -DestinationPath 'xray_bin' -Force; Copy-Item 'xray_bin\xray.exe' 'xray.exe' -Force"

echo [3/3] Собираю EXE...
pyinstaller --noconfirm --onefile --windowed --name "JeffTON" --add-binary "xray.exe;." qipcall.py

echo.
echo Готово! Файл: dist\JeffTON.exe
pause
