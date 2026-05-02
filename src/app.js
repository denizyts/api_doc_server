const express = require('express');
const generators = require('./generators');
const fs = require("fs");

let cfg = require('../config');

const app = express();
const PORT = cfg?.port || 3000;

app.get('/', (req, res) => {
    try {
        const raw = fs.readFileSync(`public/index.html`, "utf-8");
        res.send(raw);
    } catch (error) {
        console.error(`HTML generation error: ${error?.stack}`);
        res.status(500).send('Error Occured');
    }
});

for (let collection of cfg?.collections) {
    app.get(collection?.pathName, async (req, res) => {
        try {
            let type = collection?.type;
            const raw = fs.readFileSync(`collection_exports/${collection?.name}`, "utf-8");
            const readedJson = JSON.parse(raw);
            const generator = generators.find(g => g.key === type);
            let html = await generator?.generate(
                {
                    'json': readedJson
                });
            res.send(html);
        } catch (error) {
            console.error(`HTML generation error: ${error?.stack}`);
            res.status(500).send('Error Occured');
        }
    });
    console.debug(`Collection ${collection?.name} is registered at ${collection?.pathName}`);
}

app.listen(PORT, () => {
    console.log(`Server runs at port: ${PORT}`);
});