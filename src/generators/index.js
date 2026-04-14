

const fs = require("fs");
const path = require("path");

const generators = fs
  .readdirSync(__dirname)
  .filter(file => file !== "index.js")
  .map(file => require(path.join(__dirname, file)));

module.exports = generators;