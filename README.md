# Fleet Management API

This API server, built using node.js and express, is to allow both the rider app and fleet management web portal to request and send data between the back end services.

## Set up

### Environment Variables

Create an .env file

Add the following lines.

MYSQL_USER = "username"

MYSQL_PASSWORD = "password"

MYSQL_SERVER = "server"

MYSQL_PORT = "port"

MYSQL_DB = "database"

TRACCAR_USER = "username"

TRACCAR_PASSWORD = "password"

GOOGLE_API_KEY = "Google maps API key"

### To install dependencies, run:

npm install

## Running the app

### To run:

Execute: node app.js

API requests can be made via 'http://localhost:3000'
