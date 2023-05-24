module.exports = {
    canvasLocation: "./place.png", // Canvas location
    blankCanvasLocation: "./blank.png", // Blank canvas location, If the canvas is blank this will be added
    limit: null, // Limit the amount of pixels a user can do (in seconds)
    resetOnLoad: false, // Reset canvas once started
    save: 60, // Save interval (in seconds)
    canvasWidth: 1024, // Width of the canvas
    canvasHeight: 1024, // Height of the canvas
    httpPort: 80, // HTTP port
    httpsPort: null, // HTTPS port
    wsPort: 80, // WS port (You can use the same port as HTTP)
    wssPort: null, // WSS port (You can use the same port as HTTPS)
    ssl: false, // SSL, if you want it secure
    sslKey: null, // SSL key location,
    sslCert: null // SSL certificate location
}