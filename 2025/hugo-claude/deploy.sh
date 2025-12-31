#!/bin/bash

# Build Hugo site
echo "Building Hugo site..."
hugo

# Deploy to server
echo "Deploying to 2025.teamleads.kz..."
rsync -avz --delete --rsync-path="sudo rsync" public/ ps-enter:/opt/2025.teamleads.kz/latest/

echo "Done!"
