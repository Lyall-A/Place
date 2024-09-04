const Server = require("./http/Server");
const DirRouter = require("./http/DirRouter");
const fs = require("fs");
const { WebSocketServer } = require("ws"); // TODO: wanna make my own :(

const config = require("./config.json");

const wsClients = [];
const server = new Server();
const wsServer = new WebSocketServer({ server: server.server, path: "/ws" });

const canvasFile =
    fs.existsSync(config.canvasLocation) ? fs.readFileSync(config.canvasLocation) : // Canvas
    fs.existsSync(config.blankCanvasLocation) ? fs.readFileSync(config.blankCanvasLocation) : // Blank canvas
    parseObj({ width: config.width, height: config.height, pixels: new Array(config.width * config.height).fill(config.blankCanvasColor || "#FFFFFF") }); // Create blank canvas

let canvasChanged = null;
const canvas = parseBmp(canvasFile);

new DirRouter("public", server.router, { dontPreload: true }); // Public
// new DirRouter("public", server.router); // Public

server.get("/canvas", (req, res) => res.send(parseObj(canvas), "image/bmp")); // Canvas

server.any("*", (req, res) => res.sendStatus(404));

wsServer.on("connection", (socket, req) => {
    socket.json = json => socket.send(JSON.stringify(json));

    socket.on("message", msg => {
        let json;
        try { json = JSON.parse(msg) } catch (err) { }
        if (!json) return socket.close();

        if (json.action === "set-color") {
            const { x, y, color } = json;
            if (!x || !y || !color) return socket.json({ error: "Invalid parameters!" }); // TODO: anti-fuckup if invalid parameters
            
            setColor(x, y, hexToRgb(color));
        }
    });

    const index = wsClients.push(socket);
    socket.on("close", () => wsClients[index] = null);
});

function sendAll(json) {
    for (client of wsClients) {
        if (!client) continue;
        client.json(json);
    }
};

function setColor(x, y, color) {
    const index = y * canvas.width + x;
    canvas.pixels[index] = color;
    canvasChanged = true;
    sendAll({ action: "color-changed", x, y, color });
}

server.listen(config.port, () => console.log(`Listening at :${config.port}`));

setInterval(() => {
    if (canvasChanged !== false) {
        fs.writeFile(config.canvasLocation, parseObj(canvas), err => {
            if (err) return console.log("Failed to save canvas!", err);
            console.log("Saved canvas");
            canvasChanged = false;
        });
    }
}, config.saveInterval);

// BMP stuff

/*
JSON object layout:
{
    "width": <int (bmp width)>,
    "height": <int (bmp height)>,
    "pixels" <array (all pixels in hex value)>
}
*/

// BMP > JSON object
function parseBmp(bmp) {
    const pixelArrayOffset = bmp.readUInt16LE(10);
    const width = bmp.readUInt16LE(18);
    const height = bmp.readUInt16LE(22);
    const colorDepth = bmp.readUInt16LE(28);

    const rowSize = Math.ceil((colorDepth * width) / 32) * 4;

    const pixels = [];

    let offset = pixelArrayOffset + (rowSize * (height - 1));

    for (let y = height - 1; y >= 0; y--) {
        for (let x = 0; x < width; x++) {
            const b = bmp.readUInt8(offset++);
            const g = bmp.readUInt8(offset++);
            const r = bmp.readUInt8(offset++);

            pixels.push(rgbToHex(r, g, b));
        }

        offset -= (width * 3) + rowSize;
    }

    return {
        width,
        height,
        pixels
    }
}

// JSON object > BMP
function parseObj(obj) {
    const { width, height, pixels } = obj;

    const pixelArray = createPixelArray();
    const size = 14 + 40 + pixelArray.length;
    const bitmapFileHeader = createBitmapFileHeader();
    const dibHeader = createDibHeader();

    return Buffer.concat([bitmapFileHeader, dibHeader, pixelArray]);

    function createBitmapFileHeader() {
        const bitmapFileHeader = Buffer.alloc(14);

        bitmapFileHeader.write("BM"); // BM
        bitmapFileHeader.writeUInt32LE(size, 2); // Size
        bitmapFileHeader.writeUInt16LE (0, 6); // Reserved
        bitmapFileHeader.writeUInt16LE(0, 8); // Reserved
        bitmapFileHeader.writeUInt32LE(14 + 40, 10); // Pixel array offset

        return bitmapFileHeader;
    }
    
    function createDibHeader() {
        const dibHeader = Buffer.alloc(40); // BITMAPINFOHEADER

        dibHeader.writeUInt32LE(40); // Size
        dibHeader.writeInt32LE(width, 4); // Width
        dibHeader.writeInt32LE(height, 8); // Height
        dibHeader.writeUInt16LE(1, 12); // Color planes
        dibHeader.writeUInt16LE(24, 14); // Color depth
        dibHeader.writeUInt32LE(0, 16); // Compression
        dibHeader.writeUInt32LE(0, 20); // Image size
        dibHeader.writeInt32LE(0, 24); // Horizontal resolution
        dibHeader.writeInt32LE(0, 28); // Vertical resolution
        dibHeader.writeUInt32LE(0, 32); // Color palette
        dibHeader.writeUInt32LE(0, 36); // Important colors

        return dibHeader
    }

    function createPixelArray() {
        const rowSize = Math.ceil((24 * width) / 32) * 4;
        const padding = rowSize - width * 3;

        const pixelArray = Buffer.alloc(rowSize * height);

        let offset = 0;
        for (let y = height - 1; y >= 0; y--) {
            for (let x = 0; x < width; x++) {
                const index = y * width + x;
                const [red, green, blue] = pixels[index] instanceof Array ? pixels[index] : hexToRgb(pixels[index]);

                pixelArray.writeUInt8(blue, offset++);
                pixelArray.writeUInt8(green, offset++);
                pixelArray.writeUInt8(red, offset++);
            }
            
            pixelArray.fill(0, offset, offset + padding);
            offset += padding;
        }

        return pixelArray;
    }
}

function hexToRgb(hex) {
    hex = hex.toLowerCase().replace(/[^0-9a-f]/g, "");

    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    return [r, g, b];
}

function rgbToHex(r, g, b) {
    const red = r.toString(16).padStart(2, "0");
    const green = g.toString(16).padStart(2, "0");
    const blue = b.toString(16).padStart(2, "0");

    return `${red}${green}${blue}`;
}