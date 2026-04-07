#!/bin/bash
cd "$(dirname "$0")"
git add .
git commit -m "deploy: $(date '+%Y-%m-%d %H:%M:%S')"
git push
echo "Pushed to GitHub. Replit will auto-deploy via GitHub Action."
