const colors = [
    { color: "red" },
    { color: "green" },
    { color: "blue" },
    { color: "yellow" },
    { color: "purple" },
    { color: "pink" },
    { color: "aqua" },
    { color: "orange" },
    { color: "gold" },
    { color: "teal" },
    { color: "indigo" },
    { color: "lightgreen" },
    { color: "darkred" },
    { color: "white" },
    { color: "black" },
]

let selectedColor;
let dragToDraw = true;
const minZoom = 5; // Divided by page width
const maxZoom = 5; // Multiplied by page width
const canvasBoundaryLimit = 50; // How far the canvas can go out of view in pixels
let leftMouseDown = false;
let rightMouseDown = false;

function showColors() {
    const colorsElement = document.getElementById("colors");

    for (const colorIndex in colors) {
        const color = colors[colorIndex];
        const colorElement = document.createElement("div");

        colorElement.classList.add("color");
        colorElement.style.backgroundColor = color.color;
        colorElement.onclick = () => selectColor(colorIndex);
        
        colorsElement.appendChild(colorElement);
        
        color.element = colorElement;
        color.rgb = getComputedStyle(colorElement).backgroundColor.match(/rgb\((.*), (.*), (.*)\)/).slice(1);
    };
}

function selectColor(index) {
    selectedColor?.element?.classList.remove("selected");
    selectedColor = colors[index];
    selectedColor?.element?.classList.add("selected");
}

function connectWs() {
    return new Promise((resolve, reject) => {
        console.log("Connecting to WebSocket...");
        wsConnection = new WebSocket("/ws");
        wsConnection.json = json => wsConnection.send(JSON.stringify(json));

        let opened = false;
        
        wsConnection.onopen = () => {
            opened = true;
            console.log("Connected to WebSocket");
            resolve();
        }
        wsConnection.onerror = err => {
            console.error("WebSocket error!", err);
            if (!opened) reject(err);
        }
        wsConnection.onmessage = msg => {
            const json = JSON.parse(msg.data);
            console.log("WebSocket message:", json);

            if (json.action === "color-changed") {
                const imageData = ctx.getImageData(json.x, json.y, 1, 1);
                imageData.data[0] = json.color[0];
                imageData.data[1] = json.color[1];
                imageData.data[2] = json.color[2];

                ctx.putImageData(imageData, json.x, json.y);
            }
        }
    });
}

function loadCanvas() {
    return new Promise((resolve, reject) => {
        console.log("Loading canvas...");

        canvas = document.getElementById("canvas");
        ctx = canvas.getContext("2d", { willReadFrequently: true });
        
        const image = new Image();
        image.src = "/canvas";
        image.onload = () => {
            canvas.width = image.width;
            canvas.height = image.height;
            
            ctx.drawImage(image, 0, 0);
            
            console.log("Loaded canvas");
            resolve();
        }
        image.onerror = err => {
            console.log("Failed to load canvas!", err);
            reject(err);
        }
    })
}

function getCanvasPixel(e) {
    return {
        x: e.pageX - canvas.offsetLeft,
        y: e.pageY - canvas.offsetTop,
        canvasX: Math.round((e.pageX - canvas.offsetLeft) * (canvas.width / canvas.offsetWidth)),
        canvasY: Math.round((e.pageY - canvas.offsetTop) * (canvas.height / canvas.offsetHeight))
    }
}

function setPixel(e) {
    const { canvasX, canvasY } = getCanvasPixel(e);
    const imageData = ctx.getImageData(canvasX, canvasY, 1, 1);
    if (imageData.data[0] == selectedColor.rgb[0] && imageData.data[1] == selectedColor.rgb[1] && imageData.data[2] == selectedColor.rgb[2]) return console.log("Not replacing pixel with the same color!");
    wsConnection.json({ action: "set-color", x: canvasX, y: canvasY, color: selectedColor.rgb });
}