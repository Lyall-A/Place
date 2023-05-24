const { join } = require("path");
const http = require("http");
const https = require("https");
const status = http.STATUS_CODES;
const { createCanvas, loadImage } = require("canvas");
const ws = require("ws").Server;
const { writeFileSync, readFileSync, existsSync } = require("fs");
function dir(path) { return path.startsWith(".") ? join(__dirname, path) : path };
const { canvasLocation = "./place.png", blankCanvasLocation = "./clear.png", limit = 60, resetOnLoad = false, save = 60, canvasWidth = 1024, canvasHeight = 1024, httpPort = 80, httpsPort = null, wsPort = 80, wssPort = null, ssl = false, sslKey = null, sslCert = null } = require(dir("./config"));
const page = readFileSync(dir("./index.html"), "utf8").replace(/<wsprot>/g, wssPort ? "wss://" : "ws://").replace(/<wsport>/g, wssPort ? wssPort : wsPort);

let httpServer;
let httpsServer;

let key;
let cert;

let wsServer;
let wssServer;
const clients = { };

let wsSocket;
let wssSocket;

let canvas;
let Canvas;
let canvasCtx;
let blank;

let change = false;

if (sslKey) if (existsSync(dir(sslKey))) key = readFileSync(dir(sslKey));
if (sslCert) if (existsSync(dir(sslCert))) cert = readFileSync(dir(sslCert));

if (httpPort) httpServer = http.createServer();
if (httpsPort && ssl && key && cert) httpsServer = https.createServer({ key, cert });

if (wsPort) if (wsPort !== httpPort)  wsServer = http.createServer();
if (wssPort && ssl && key && cert) if (wssPort !== httpsPort) wssServer = https.createServer({ key, cert });

if (httpServer) {
    httpServer.on("request", request);
    httpServer.listen(httpPort, () => console.log(`HTTP server listening on port ${httpPort}`));
}
if (httpsServer) {
    httpsServer.on("request", request);
    httpsServer.listen(httpsPort, () => console.log(`HTTPS server listening on port ${httpsPort}`));
}

if (wsPort && (wsPort === httpPort || wsServer)) {
    wsSocket = new ws({ server: wsServer || httpServer });
    wsSocket.on("connection", connection);
    if (wsServer) wsServer.listen(wsPort, () => console.log(`WS server listening on port ${wsPort}`)); else console.log(`WS server listening on port ${wsPort} (same as HTTP)`);
}
if (wssPort && (wssPort === httpsPort || wssServer)) {
    wssSocket = new ws({ server: wssServer || httpsServer });
    wssSocket.on("connection", connection);
    if (wssServer) wssServer.listen(wssPort, () => console.log(`WSS server listening on port ${wssPort}`)); else console.log(`WSS server listening on port ${wssPort} (same as HTTPS)`);
}

if (!existsSync(dir(canvasLocation)) || resetOnLoad) {
    // If there is no canvas or reset on load is set
    Canvas = createCanvas(canvasWidth, canvasHeight);
    canvasCtx = Canvas.getContext("2d");
    if (existsSync(dir(blankCanvasLocation))) {
        // If blank canvas then load onto canvas
        loadImage(dir(blankCanvasLocation)).then(blank => {
            canvasCtx.drawImage(blank, 0, 0);
            const buf = Canvas.toBuffer();
            canvas = buf;
            writeFileSync(dir(canvasLocation), buf); // Save canvas
        });
    } else {
        // If no blank canvas then set to plain white
        canvasCtx.fillStyle = "white";
        canvasCtx.fillRect(0, 0, Canvas.width, Canvas.height);
        const buf = Canvas.toBuffer()
        canvas = buf;
        writeFileSync(dir(canvasLocation), buf); // Save canvas
    }
} else {
    // If there is canvas set then load
    canvas = readFileSync(dir(canvasLocation));
    Canvas = createCanvas(canvasWidth, canvasHeight);
    canvasCtx = Canvas.getContext("2d");
    loadImage(dir(canvasLocation)).then(can => {
        canvasCtx.drawImage(can, 0, 0);
    });
}

if (existsSync(dir(blankCanvasLocation))) blank = readFileSync(dir(blankCanvasLocation)); // Load blank canvas if exists

setInterval(() => {
    // Update canvas' PNG file
    if (!change) return;
    try {
        writeFileSync(dir(canvasLocation), Canvas.toBuffer());
        canvas = readFileSync(dir(canvasLocation));
    } catch (err) { console.log(`Failed to save canvas!`) }
    change = false;
}, save ? save * 1000 : 1000);

function request(req, res) {
    // Request paths
    switch (req.url.split("?")[0]) {
        case "/":
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(page);
            break;
        case "/canvas":
            res.writeHead(200, { "Content-Type": `image/${canvasLocation.substring(canvasLocation.lastIndexOf(".") + 1)}` });
            res.end(Canvas.toBuffer());
            break;
        case "/canvasimage":
            res.writeHead(200, { "Content-Type": `image/${canvasLocation.substring(canvasLocation.lastIndexOf(".") + 1)}` });
            res.end(canvas);
            break;
        case "/blankimage":
            if (blank) {
                res.writeHead(200, { "Content-Type": `image/${blankCanvasLocation.substring(blankCanvasLocation.lastIndexOf(".") + 1)}` });
                res.end(blank);
                break;
            }
        default:
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end(`404 ${status["404"]}`);
            break;
    }
}

// WS connection
function connection(client) {
    const id = genId(); // Generate a unique ID for the client
    clients[id] = client;
    let lastHeartbeat = Date.now();
    let lastColor;
    setTimeout(() => { if ((Date.now() - lastHeartbeat) > 10000) return client.close(); }, 15000); // Check if heartbeat received within 15 seconds, if not then close
    client.send(JSON.stringify({ w: canvasWidth, h: canvasHeight })); // Send canvas details
    client.on("message", msg => {
        // If message is heartbeat
        if (msg.toString() === "heartbeat") {
            setTimeout(() => { if ((Date.now() - lastHeartbeat) > 10000) return client.close(); }, 15000);
            client.send("heartbeat");
            return lastHeartbeat = Date.now();
        }

        // Verification stuff
        try { msg = JSON.parse(msg) } catch (err) { return client.close() }; // Try parse message in JSON, if fail then close
        if (typeof msg.x === "undefined" || typeof msg.y === "undefined") return client.close(); // If message does not have x or y then close
        if (msg.x > canvasWidth) return client.close(); // If x is larger than width then close
        if (msg.y > canvasHeight) return client.close(); // If y is larger than height then close
        if (!msg.c) msg.c = "#000000";
        if (typeof msg.c !== "string") return client.close(); // Check if color is string, if not then close
        if (!/^#[0-9A-F]{6}$/i.test(msg.c)) return client.close(); // Check if color is valid hex color, if not then close

        if (lastColor && limit) if ((Date.now() - lastColor) < (limit * 1000)) return client.send(JSON.stringify({ code: 0 })); // If client is rate-limited then send code 0
        const pixelData = canvasCtx.getImageData(msg.x, msg.y, 1, 1).data; // Get pixel color
        if (`#${rgbToHex(pixelData[0], pixelData[1], pixelData[2])}` === msg.c.toLowerCase()) return client.send(JSON.stringify({ code: 1 })); // If pixel color is already set to what the client sent then send code 1
        canvasCtx.fillStyle = msg.c; // Set color
        canvasCtx.fillRect(msg.x, msg.y, 1, 1); // Fill color
        lastColor = Date.now(); // Set client's last color date, for rate-limits
        if (!change) change = true; // For canvas' updating
        Object.values(clients).forEach(i => { try { i.send(JSON.stringify({ x: msg.x, y: msg.y, c: msg.c || "#000000" })) } catch (err) { } }); // Update pixel color for all clients
    });
    client.on("close", () => delete clients[id]); // When client disconnected delete from client list
}

// Client ID gen
function genId() {
    const id = Math.round(Math.random() * 1000000000000000);
    if (clients[id]) return genId();
    return id;
}

// Convert RGB to HEX for canvas image data
function rgbToHex(r, g, b) {
    r = r.toString(16);
    g = g.toString(16);
    b = b.toString(16);
    if (r.length === 1) r = `0${r}`;
    if (g.length === 1) g = `0${g}`;
    if (b.length === 1) b = `0${b}`;
    return r+g+b;
}