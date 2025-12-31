#!/bin/bash

# Build Hugo site
echo "Building Hugo site..."
hugo

# Deploy to server
echo "Deploying to teamleads.kz..."
rsync -avz --delete --rsync-path="sudo rsync" public/ ps-enter:/opt/teamleads.kz/latest/

echo "Done!"
