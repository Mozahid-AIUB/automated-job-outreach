@echo off
cd /d "D:\Way_To_Job\Job_emailing_automation"
echo [%date% %time%] Starting weekly job sync...
"C:\Program Files\nodejs\node.exe" sync-jobs.js >> logs\sync-weekly.log 2>&1
echo [%date% %time%] Sync completed.
