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