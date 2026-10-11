const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const express = require('express');
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const formats = {
 'image/png': {extension:'.png', matches:b => b.length >= 24 && b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))},
 'image/jpeg': {extension:'.jpg', matches:b => b.length >= 4 && b[0] === 255 && b[1] === 216 && b[2] === 255},
 'image/gif': {extension:'.gif', matches:b => b.length >= 13 && /GIF8[79]a/.test(b.subarray(0,6).toString('ascii'))},
 'image/webp': {extension:'.webp', matches:b => b.length >= 20 && b.toString('ascii',0,4) === 'RIFF' && b.toString('ascii',8,12) === 'WEBP'}
};
// Hinter dem LAN-Zugang installieren; keine vom Client gewählten Pfade akzeptieren.
function installImageUpload(app, directory) {
 app.post('/api/images', (req,res,next) => {
  if (!formats[req.get('content-type')?.split(';')[0]]) return res.status(415).json({error:'Erlaubt sind PNG, JPEG, GIF und WebP.'});
  next();
 }, express.raw({type:() => true,limit:MAX_IMAGE_BYTES}), (req,res) => {
  const format = formats[req.get('content-type').split(';')[0]];
  if (!Buffer.isBuffer(req.body) || !format.matches(req.body)) return res.status(400).json({error:'Das Bildformat ist ungültig.'});
  const imagePath = path.join(directory, `${randomUUID()}${format.extension}`);
  fs.writeFileSync(imagePath,req.body,{mode:0o600,flag:'wx'});
  res.status(201).json({imagePath});
 }, (error,req,res,next) => {
  if (error.type === 'entity.too.large') return res.status(413).json({error:'Das Bild darf höchstens 10 MB groß sein.'});
  next(error);
 });
}
module.exports = {installImageUpload,MAX_IMAGE_BYTES};
