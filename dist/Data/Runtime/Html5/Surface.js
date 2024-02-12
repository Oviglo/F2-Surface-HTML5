//----------------------------------------------------------------------------------
//
// CRunSurface.js
// Author: Loïc OVIGNE
//
//----------------------------------------------------------------------------------
/* Copyright (c) 2020 Oviglo
*/
function OSurfaceImage() {
    this.canvas = document.createElement("canvas");
    this.context = this.canvas.getContext("2d");
    this.hasAlphaChannel = !1;
    this.transparentColor = CServices.swapRGB(0);
    this.useTransparentColor = !0;
    this.isInitImage = !1;
    this.rotation = this.imageHandle = 0;
    this.yScale = this.xScale = 1;
    this.smoothScale = !1;
    this.hotSpot = { x: 0, y: 0 };
    this.fileLoaded = this.updateTransparent = !1;
}
OSurfaceImage.prototype = {
    getWidth: function () {
        return this.canvas.width;
    }, getHeight: function () {
        return this.canvas.height;
    }, drawTransparentColor: function (b, a, d, c) {
        if (this.useTransparentColor && this.updateTransparent) {
            for (var f = this.context.getImageData(b, a, d, c), g = f.data, h = 0; h < d * c; h++) {
                CServices.swapRGB(g[4 * h] << 16 | g[4 * h + 1] << 8 | g[4 * h + 2]) == this.transparentColor && (g[4 * h + 3] = 0);
            }
            f.data = g;
            this.context.putImageData(f, b, a);
            this.updateTransparent = !1;
        }
    }, setAlphaAt: function (b, a, d) {
        b = Math.max(0, Math.min(b, this.getWidth()));
        a = Math.max(0, Math.min(a, this.getHeight()));
        d = Math.max(0, Math.min(d, 255));
        var c = this.context.getImageData(b, a, 1, 1);
        c.data[3] = d;
        this.context.putImageData(c, b, a);
        255 == d || this.hasAlphaChannel || (this.hasAlphaChannel = !0);
    }, deleteAlphaChannel: function () {
        this.hasAlphaChannel = !1;
        for (var b = this.context.getImageData(0, 0, this.getWidth(), this.getHeight()), a = b.data, d = 0; d < a.length; d += 4) {
            a[d + 3] = 255;
        }
        b.data = a;
        this.context.putImageData(b, 0, 0);
    }
};
function OSurfacePattern() {
    this.name;
    this.type = "";
    this.tiledImage = -1;
    this.color = this.colorB = this.colorA = this.tiledImageOffsetY = this.tiledImageOffsetX = 0;
    this.vertical = !1;
    this.callbackContext = null;
}
OSurfacePattern.TYPE_TILED_IMAGE = "tiled_image";
OSurfacePattern.TYPE_LINEAR_GRADIENT = "linear_gradient";
OSurfacePattern.TYPE_RADIAL_GRADIENT = "radial_gradient";
OSurfacePattern.TYPE_COLOR = "color";
OSurfacePattern.TYPE_CALLBACK = "callback";
function OSurface() {
    this.h_def = this.w_def = this.h = this.w = this.y = this.x = 0;
    this.storedAlpha = [];
    this.extensionObject = this.globalContext = this.context = null;
    this.skipRedraw = this.antiAliasing = this.useAbsoluteCoordinates = !1;
    this.blit = { xDest: 0, yDest: 0, wDest: null, hDest: null, xSource: 0, ySource: 0, wSource: null, hSource: null, image: 0, alphaComposition: !1, regionflag: 0, stretchMode: 0, xHotSpot: 0, yHotSpot: 0, hotSpotMode: 0, angle: 0, useTransparency: !0, effect: null, callback: "", alpha: 255, tin: 0, };
    this.savedBlit = null;
    this.nImages = 0;
    this.imageList = [];
    this.selectedImage = this.currentImage = -1;
    this.MAX_IMAGES = 16;
    this.patterns = [];
    this.points = [];
    this.selectLast = this.dispTarget = this.multiImg = this.keepPoints = this.threadedIO = !1;
    this.textParams = { size: "13pt", family: "Arial", style: "", weight: 5, decoration: 0, vAlign: 0, hAlign: 0, angle: 0, };
    this.callback = { xPos: 0, yPos: 0, colorReturn: !1, colNew: 0, colDest: 0, colSrc: 0, alphaReturn: !1, alphaSrc: 255, alphaDest: 255, };
    this.floodArea = { x1: 0, y1: 0, x2: 0, y2: 0 };
    this.storedImage = document.createElement("canvas").getContext("2d");
}
OSurface.BLIT_EFFECT_AND = "and";
OSurface.BLIT_EFFECT_OR = "or";
OSurface.BLIT_EFFECT_XOR = "xor";
OSurface.BLIT_EFFECT_SEMI_TRANSPARENCY = "semi-transparency";
OSurface.BLIT_EFFECT_TINT = "tint";
OSurface.prototype = {
    getXCoord: function () {
        return this.useAbsoluteCoordinates ? -this.x : 0;
    }, getYCoord: function () {
        return this.useAbsoluteCoordinates ? -this.y : 0;
    }, redraw: function () {
        this.redrawPart(0, 0, this.w, this.h);
    }, redrawPart: function (b, a, d, c) {
        if (0 != d && 0 != c && !this.skipRedraw && this.currentImage == this.selectedImage) {
            var f = this.globalContext;
            f.clearRect(b, a, d, c);
            this.hasImageIndex(this.currentImage) && (f.canvas.width = this.imageList[this.currentImage].getWidth(), f.canvas.height = this.imageList[this.currentImage].getHeight(), this.w = this.imageList[this.currentImage].getWidth(), this.h = this.imageList[this.currentImage].getHeight(), f.drawImage(this.imageList[this.currentImage].canvas, b, a, d, c));
        }
    }, redrawTransparentColor: function (b, a, d, c) {
        this.imageList[this.currentImage].drawTransparentColor(b, a, d, c);
    }, setCurrentImage: function (b) {
        0 > b && (b = 0);
        b > this.nImages && (b = this.nImages);
        this.hasImageIndex(b) && (this.currentImage = b, 0 <= this.currentImage && (this.context = this.imageList[this.currentImage].context), this.w = this.imageList[this.currentImage].getWidth(), this.h = this.imageList[this.currentImage].getHeight(), this.imageList[this.currentImage].updateTransparent = !0, this.redraw());
    }, setSelectedImage: function (b) {
        0 > b && (b = 0);
        b > this.nImages && (b = this.nImages);
        this.hasImageIndex(b) && (this.selectedImage = b, 0 <= this.selectedImage && this.loadBankImage(this.selectedImage), this.context = this.imageList[this.selectedImage].context, this.dispTarget && (this.currentImage = this.selectedImage, this.redraw()));
    }, deleteImage: function (b) {
        if (this.hasImageIndex(b)) {
            this.imageList.splice(b, 1);
            this.nImages = this.imageList.length;
            if (this.selectedImage == b || this.selectedImage == this.nImages) {
                0 < this.selectedImage ? this.selectedImage-- : this.selectedImage = -1;
            }
            if (this.currentImage == b || this.currentImage == this.nImages) {
                0 < this.currentImage ? this.currentImage-- : this.currentImage = -1, this.redraw();
            }
        }
    }, deleteAllImages: function () {
        this.selectedImage = this.currentImage = -1;
        this.imageList.splice(0, this.imageList.length);
        this.redraw();
    }, insertImageAt: function (b, a, d) {
        var c = new OSurfaceImage;
        c.canvas.width = a;
        c.canvas.height = d;
        this.imageList.splice(b, 0, c);
        this.selectLast && (this.selectedImage = b, this.redraw());
    }, copyImage: function (b, a) {
        this.hasImageIndex(b) && this.hasImageIndex(a) && (this.loadBankImage(a), this.imageList[b].context.clearRect(0, 0, this.imageList[b].getWidth(), this.imageList[b].getHeight()), this.imageList[b].context.drawImage(this.imageList[a].canvas, 0, 0, this.imageList[a].getWidth(), this.imageList[a].getHeight()), this.imageList[b].useTransparentColor = !1, b == this.currentImage && this.redraw());
    }, copyImageFromCanvas: function (b, a) {
        this.hasImageIndex(b) && (this.imageList[b].context.clearRect(0, 0, this.imageList[b].getWidth(), this.imageList[b].getHeight()), this.imageList[b].context.drawImage(a, 0, 0, a.width, a.height), this.imageList[b].useTransparentColor = !1, b == this.currentImage && this.redraw());
    }, quickStoreImage: function () {
        this.storedImage.clearRect(0, 0, this.storedImage.canvas.width, this.storedImage.canvas.height);
        this.storedImage.canvas.width = this.imageList[this.selectedImage].getWidth();
        this.storedImage.canvas.height = this.imageList[this.selectedImage].getHeight();
        this.storedImage.drawImage(this.imageList[this.selectedImage].canvas, 0, 0);
    }, quickRestoreImage: function () {
        this.imageList[this.selectedImage].context.drawImage(this.storedImage.canvas, 0, 0);
    }, setHotSpotX: function (b) {
        this.imageList[this.selectedImage].hotSpot.x = Math.max(0, b);
    }, setHotSpotY: function (b) {
        this.imageList[this.selectedImage].hotSpot.y = Math.max(0, b);
    }, loadBankImage: function (b) {
        if (this.hasImageIndex(b) && !this.imageList[b].isInitImage) {
            var a = this.extensionObject.rh.rhApp.imageBank.getImageFromHandle(this.imageList[b].imageHandle);
            null != a ? (0 == a.mosaic && null != a.img ? (this.imageList[b].canvas.width = a.width, this.imageList[b].canvas.height = a.height, this.imageList[b].context.drawImage(a.img, 0, 0)) : (this.imageList[b].canvas.width = a.width, this.imageList[b].canvas.height = a.height, this.imageList[b].context.drawImage(a.app.imageBank.mosaics[a.mosaic], a.mosaicX, a.mosaicY, a.width, a.height, 0, 0, a.width, a.height)), this.imageList[b].hotSpot.x = a.xSpot, this.imageList[b].hotSpot.y = a.ySpot, this.imageList[b].hasAlphaChannel =
                this.imageHasAlpha(this.imageList[b].context)) : (this.imageList[b].canvas.width = this.w_def, this.imageList[b].canvas.height = this.h_def);
            this.imageList[b].isInitImage = !0;
        }
    }, imageHasAlpha: function (b) {
        b = b.getImageData(0, 0, b.canvas.width, b.canvas.height).data;
        for (var a = !1, d = 3, c = b.length; d < c; d += 4) {
            if (255 > b[d]) {
                a = !0;
                break;
            }
        }
        return a;
    }, setTransparentColor: function (b, a, d) {
        if (this.hasImageIndex(b)) {
            var c = this.imageList[b].transparentColor;
            this.imageList[b].transparentColor = a;
            d ? this.replaceColor(b, c, a) : this.currentImage == b && this.redraw();
        }
    }, replaceColor: function (b, a, d) {
        if (this.hasImageIndex(b)) {
            var c = a >>> 16 & 255, f = a >>> 8 & 255;
            a &= 255;
            newRed = d >>> 16 & 255;
            newGreen = d >>> 8 & 255;
            newBlue = d & 255;
            for (var g = this.imageList[b].context.getImageData(0, 0, this.imageList[b].getWidth(), this.imageList[b].getHeight()), h = 0; h < g.data.length; h += 4) {
                g.data[h] == c && g.data[h + 1] == f && g.data[h + 2] == a && (g.data[h] = newRed, g.data[h + 1] = newGreen, g.data[h + 2] = newBlue);
            }
            this.imageList[b].context.putImageData(g, 0, 0);
            this.updateTransparent = d == this.imageList[b].transparentColor;
            this.currentImage == b && this.redraw();
        }
    }, getTransparentColor: function (b) {
        return this.hasImageIndex(b) ? this.imageList[b].transparentColor : 0;
    }, setTransparent: function (b) {
        for (var a = 0; a < this.imageList.length; a++) {
            this.imageList[a].useTransparentColor = b;
        }
    }, loadFileImage: function (b, a, d, c) {
        var f = this;
        this.imageList[this.selectedImage].fileLoaded = !1;
        if (this.hasImageIndex(b)) {
            var g = new Image;
            g.src = a;
            g.onload = function () {
                f.imageList[b].context.drawImage(g, 0, 0);
                f.redrawPart(0, 0, g.width, g.height);
                f.imageList[f.selectedImage].fileLoaded = !0;
                d();
            };
            g.onerror = function () {
                c();
            };
        }
    }, hasAlpha: function (b) {
        "undefined" == typeof b && (b = this.selectedImage);
        return "undefined" != typeof this.imageList[b] && this.imageList[b].hasAlphaChannel;
    }, storeAlpha: function () {
        this.hasAlpha() && this.hasImageIndex(this.selectedImage) && (this.imageList[this.selectedImage].context.globalCompositeOperation = "source-atop");
    }, restoreAlpha: function () {
        this.hasAlpha() && this.hasImageIndex(this.selectedImage) && 0 < this.storedAlpha.length && (this.imageList[this.selectedImage].context.globalCompositeOperation = "source-over");
    }, setAlpha: function (b, a, d, c) {
        "undefined" != typeof this.imageList[b] && this.imageList[b].setAlphaAt(a, d, c);
    }, setClippingRect: function (b, a, d, c) {
        var f = this.imageList[this.selectedImage].context;
        f.rect(b, a, d, c);
        f.clip();
    }, clearClippingRect: function () {
        var b = this.imageList[this.selectedImage].context;
        b.rect(0, 0, b.canvas.width, b.canvas.height);
        b.clip();
    }, flipVerticaly: function () {
        var b = this.imageList[this.selectedImage].context, a = document.createElement("canvas").getContext("2d");
        a.canvas.width = b.canvas.width;
        a.canvas.height = b.canvas.height;
        a.drawImage(b.canvas, 0, 0);
        b.clearRect(0, 0, b.canvas.width, b.canvas.height);
        for (var d = 0; d < b.canvas.height; d++) {
            b.drawImage(a.canvas, 0, d, b.canvas.width, 1, 0, b.canvas.height - d - 1, b.canvas.width, 1);
        }
        this.redraw();
    }, flipHorizontaly: function (b) {
        b = this.imageList[this.selectedImage].context;
        var a = document.createElement("canvas").getContext("2d");
        a.canvas.width = b.canvas.width;
        a.canvas.height = b.canvas.height;
        a.drawImage(b.canvas, 0, 0);
        b.clearRect(0, 0, b.canvas.width, b.canvas.height);
        for (var d = 0; d < b.canvas.width; d++) {
            b.drawImage(a.canvas, d, 0, 1, b.canvas.height, b.canvas.width - d - 1, 0, 1, b.canvas.height);
        }
        this.redraw();
    }, scroll: function (b, a, d) {
        var c = this.imageList[this.selectedImage].context, f = document.createElement("canvas").getContext("2d"), g = c.canvas.width, h = c.canvas.height;
        f.canvas.width = g;
        f.canvas.height = h;
        b %= g;
        a %= h;
        f.drawImage(c.canvas, 0, 0);
        c.clearRect(0, 0, g, h);
        c.drawImage(f.canvas, 0, 0, g - b, h - a, b, a, g - b, h - a);
        d && (0 < b && c.drawImage(f.canvas, b - g, a), 0 < b && 0 < a && c.drawImage(f.canvas, b - g, a - h), 0 < a && c.drawImage(f.canvas, b, a - h), 0 > b && 0 < a && c.drawImage(f.canvas, b + g, a - h), 0 > b && c.drawImage(f.canvas, b + g, a), 0 > b && 0 > a && c.drawImage(f.canvas, b + g, a + h), 0 > a && c.drawImage(f.canvas, b, a + h), 0 < b && 0 > a && c.drawImage(f.canvas, b - g, a + h));
        this.redraw();
    }, getRectByBox: function (b, a, d, c) {
        return { x: b > d ? d : b, y: a > c ? c : a, w: Math.abs(d - b), h: Math.abs(c - a), };
    }, getEllipseByRect: function (b, a, d, c) {
        return { xCenter: b + d / 2, yCenter: a + c / 2, xRadius: d / 2, yRadius: c / 2, };
    }, getWidth: function (b) {
        if (!this.hasImageIndex(b)) {
            return 0;
        }
        this.imageList[b].fileLoaded || this.loadBankImage(b);
        return this.imageList[b].getWidth();
    }, getHeight: function (b) {
        if (!this.hasImageIndex(b)) {
            return 0;
        }
        this.imageList[b].fileLoaded || this.loadBankImage(b);
        return this.imageList[b].getHeight();
    }, setW: function (b) {
        this.w = b;
    }, setH: function (b) {
        this.h = b;
    }, resizeImage: function (b, a) {
        b = 0 > b ? 0 : b;
        a = 0 > a ? 0 : a;
        var d = document.createElement("canvas").getContext("2d");
        d.drawImage(this.imageList[this.selectedImage].canvas, 0, 0, b, a);
        this.imageList[this.selectedImage].canvas.width = b;
        this.imageList[this.selectedImage].canvas.height = a;
        this.imageList[this.selectedImage].context.drawImage(d.canvas, 0, 0);
        this.redraw();
    }, rotateImage: function (b) {
        b = b * Math.PI / 180;
        var a = this.imageList[this.selectedImage], d = a.getWidth();
        a.getHeight();
        var c = document.createElement("canvas").getContext("2d");
        c.canvas.width = 5000;
        c.canvas.height = 5000;
        c.save();
        c.translate(d, 0);
        c.rotate(-b);
        c.drawImage(a.canvas, 0, 0);
        c.restore();
        a.context.clearRect(0, 0, a.canvas.width, a.canvas.height);
        a.context.drawImage(c.canvas, -d, 0);
        this.redraw();
    }, setAngle: function (b) {
        img.rotation = b;
        this.redraw();
    }, setContrast: function (b) {
        for (var a = this.imageList[this.selectedImage], d = a.context.getImageData(0, 0, a.canvas.width, a.canvas.width), c = d.data, f = 0; f < c.length; f += 4) {
            c[f] = Math.max(0, Math.min(255, parseInt((c[f] - 128) * b + 128))), c[f + 1] = Math.max(0, Math.min(255, parseInt((c[f + 1] - 128) * b + 128))), c[f + 2] = Math.max(0, Math.min(255, parseInt((c[f + 2] - 128) * b + 128)));
        }
        a.context.putImageData(d, 0, 0);
        this.imageList[this.selectedImage].updateTransparent = !0;
        this.redraw();
    }, getInvertColor: function (b) {
        return (b & 255 ^ 255) << 16 | (b >>> 8 & 255 ^ 255) << 8 | b >>> 16 & 255 ^ 255;
    }, multiplyColors: function (b, a) {
        for (var d = [b >>> 16 & 255, b >>> 8 & 255, b & 255], c = [a >>> 16 & 255, a >>> 8 & 255, a & 255], f = [], g = 0; g < d.length; g++) {
            f.push(Math.floor(d[g] * c[g] / 255));
        }
        return CServices.swapRGB(f[0] << 16 | f[1] << 8 | f[2]);
    }, andColors: function (b, a) {
        for (var d = [b >>> 16 & 255, b >>> 8 & 255, b & 255], c = [a >>> 16 & 255, a >>> 8 & 255, a & 255], f = [], g = 0; g < d.length; g++) {
            f.push(d[g] & c[g]);
        }
        return CServices.swapRGB(f[0] << 16 | f[1] << 8 | f[2]);
    }, addColors: function (b, a) {
        for (var d = [b >>> 16 & 255, b >>> 8 & 255, b & 255], c = [a >>> 16 & 255, a >>> 8 & 255, a & 255], f = [], g = 0; g < d.length; g++) {
            var h = d[g] + c[g];
            255 < h && (h = 255);
            f.push(h);
        }
        return CServices.swapRGB(f[0] << 16 | f[1] << 8 | f[2]);
    }, substractColors: function (b, a) {
        for (var d = [b >>> 16 & 255, b >>> 8 & 255, b & 255], c = [a >>> 16 & 255, a >>> 8 & 255, a & 255], f = [], g = 0; g < d.length; g++) {
            var h = d[g] - c[g];
            0 > h && (h = 0);
            f.push(h);
        }
        return CServices.swapRGB(f[0] << 16 | f[1] << 8 | f[2]);
    }, hexToRgb: function (b) {
        return (b = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(b)) ? { r: parseInt(b[1], 16), g: parseInt(b[2], 16), b: parseInt(b[3], 16) } : null;
    }, invertColors: function () {
        for (var b = this.imageList[this.selectedImage], a = b.context.getImageData(0, 0, b.canvas.width, b.canvas.width), d = a.data, c = 0; c < d.length; c += 4) {
            d[c] ^= 255, d[c + 1] ^= 255, d[c + 2] ^= 255;
        }
        b.context.putImageData(a, 0, 0);
        this.imageList[this.selectedImage].updateTransparent = !0;
        this.redraw();
    }, convertToGrayscale: function () {
        for (var b = this.imageList[this.selectedImage], a = b.context.getImageData(0, 0, b.canvas.width, b.canvas.width), d = a.data, c = 0; c < d.length; c += 4) {
            var f = (d[c] + d[c + 1] + d[c + 2]) / 3;
            d[c] = f;
            d[c + 1] = f;
            d[c + 2] = f;
        }
        b.context.putImageData(a, 0, 0);
        this.redraw();
    }, setBrightness: function (b) {
        var a = this.imageList[this.selectedImage], d = a.context.getImageData(0, 0, a.canvas.width, a.canvas.width), c = d.data;
        b *= 100;
        for (var f = 0; f < c.length; f += 4) {
            c[f] += b / 100 * 255, c[f + 1] += b / 100 * 255, c[f + 2] += b / 100 * 255;
        }
        d.data = c;
        a.context.putImageData(d, 0, 0);
        this.imageList[this.selectedImage].updateTransparent = !0;
        this.redraw();
    }, drawRect: function (b, a, d, c, f, g, h) {
        b += this.getXCoord();
        a += this.getYCoord();
        this.storeAlpha();
        var e = this.patterns[f], k = this.patterns[h], l = document.createElement("canvas").getContext("2d");
        l.canvas.width = d;
        l.canvas.height = c;
        f == CServices.getColorString(this.imageList[this.selectedImage].transparentColor) && (l.globalAlpha = 1, this.context.globalCompositeOperation = "destination-out");
        l.fillStyle = this.hasPattern(f) ? this.getStyleByPattern(e, l) : f;
        l.fillRect(0, 0, d, c);
        l.globalAlpha = 1;
        "undefined" != typeof g && 0 < g && (l.strokeStyle = this.hasPattern(h) ? this.getStyleByPattern(k, l) : h, l.lineWidth = g, l.rect(g, g, d - 2 * g, c - 2 * g), l.strokeRect(g / 2, g / 2, d - g, c - g));
        this.context.drawImage(l.canvas, b, a);
        this.restoreAlpha();
        this.redrawPart(b, a, d, c);
        this.context.globalCompositeOperation = "source-over";
    }, drawHardRect: function (b, a, d, c, f, g) {
        for (var h = this.imageList[this.selectedImage].context.getImageData(b, a, d, c), e = h.data, k = "undefined" == typeof g ? this.hexToRgb(f) : this.hexToRgb("#000000"), l = 0; l < e.length; l += 4) {
            "undefined" == typeof g ? (e[l] = k.r, e[l + 1] = k.g, e[l + 2] = k.b, e[l + 3] = 255, CServices.getColorString(this.imageList[this.selectedImage].transparentColor) == f && (e[l + 3] = 0)) : e[l + 3] = g;
        }
        h.data = e;
        this.imageList[this.selectedImage].context.putImageData(h, b, a);
        this.redrawPart(b, a, d, c);
    }, clearWithColor: function (b) {
        b == CServices.getColorString(this.imageList[this.selectedImage].transparentColor) && this.imageList[this.selectedImage].useTransparentColor ? this.imageList[this.selectedImage].context.clearRect(0, 0, this.imageList[this.selectedImage].getWidth(), this.imageList[this.selectedImage].getHeight()) : this.drawRect(0, 0, this.imageList[this.selectedImage].getWidth(), this.imageList[this.selectedImage].getHeight(), b);
        this.redraw();
    }, clearWithAlpha: function (b) {
        this.drawHardRect(0, 0, this.imageList[this.selectedImage].getWidth(), this.imageList[this.selectedImage].getHeight(), null, b);
    }, drawLine: function (b, a, d, c, f, g) {
        var h = this.getPattern(f);
        b == d && a == c && 0 < g ? this.drawEllipse(b + g / 2, a + g / 2, g / 2, g / 2, f) : (b += this.getXCoord(), d += this.getXCoord(), a += this.getYCoord(), c += this.getYCoord(), this.storeAlpha(), f == CServices.getColorString(this.imageList[this.selectedImage].transparentColor) && (this.context.globalAlpha = 1, this.context.globalCompositeOperation = "destination-out"), this.context.lineWidth = g, this.context.strokeStyle = this.hasPattern(f) ? this.getStyleByPattern(h, this.context) : f, this.context.beginPath(),
            this.context.moveTo(b, a), this.context.lineTo(d, c), this.context.closePath(), this.context.stroke(), this.context.lineWidth = 1, this.context.globalCompositeOperation = "source-over", this.restoreAlpha(), this.redraw());
    }, drawHardLine: function (b, a, d, c, f, g) {
        for (var h = Math.abs(d - b), e = Math.abs(c - a), k = 2 * e - h, l = 0, m = this.imageList[this.selectedImage].context.getImageData(b, a, h, e), n = m.data, r = "undefined" == typeof g ? this.hexToRgb(f) : this.hexToRgb("#000000"), p = 0; p < h; p++) {
            var q = 4 * (p + h * l);
            "undefined" == typeof g ? (n[q] = r.r, n[q + 1] = r.g, n[q + 2] = r.b, n[q + 3] = 255, CServices.getColorString(this.imageList[this.selectedImage].transparentColor) == f && (n[q + 3] = 0)) : n[q + 3] = g;
            0 < k && (l += 1, k -= 2 * h);
            k += 2 * e;
        }
        m.data = n;
        this.imageList[this.selectedImage].context.putImageData(m, b, a);
        this.redrawPart(b, a, Math.abs(d - b), Math.abs(c - a));
    }, drawEllipse: function (b, a, d, c, f, g, h) {
        "undefined" == typeof g && (g = 0);
        b += this.getXCoord();
        a += this.getYCoord();
        this.storeAlpha();
        var e = this.patterns[f], k = document.createElement("canvas").getContext("2d");
        f == CServices.getColorString(this.imageList[this.selectedImage].transparentColor) && (this.context.globalCompositeOperation = "destination-out");
        g *= 0.6;
        k.canvas.width = 2 * d + g;
        k.canvas.height = 2 * c + g;
        k.beginPath();
        k.fillStyle = this.hasPattern(f) ? this.getStyleByPattern(e, k) : f;
        k.lineWidth = g;
        k.ellipse(k.canvas.width / 2, k.canvas.height / 2, d, c, 0, 0, 2 * Math.PI);
        k.fill();
        0 < g && (k.strokeStyle = this.hasPattern(h) ? this.getStyleByPattern(h, k) : h, k.lineWidth = g, k.ellipse(k.canvas.width / 2, k.canvas.height / 2, d - g / 2, c - g / 2, 0, 0, 2 * Math.PI), k.stroke());
        this.context.drawImage(k.canvas, b - 2 * d, a - 2 * c);
        this.context.globalCompositeOperation = "source-over";
        this.restoreAlpha();
        this.redraw();
    }, drawHardEllipse: function (b, a, d, c, f) {
        var g = 2 * d, h = 2 * c + 1, e = this.hexToRgb(f), k = this.imageList[this.selectedImage].context.getImageData(b - 2 * d, a - 2 * c, 2 * d, 2 * c), l = k.data;
        f = this.imageList[this.selectedImage].transparentColor == f && this.imageList[this.selectedImage].useTransparentColor;
        for (var m = 0; m < g; m++) {
            var n = m - g / 2, r = d + n;
            n = Math.round(h * Math.sqrt(g * g / 4.0 - n * n) / g);
            for (var p, q = 1; q <= n; q++) {
                p = 4 * (r + (c + q) * g), l[p] = e.r, l[p + 1] = e.g, l[p + 2] = e.b, f && (l[m + 3] = 0), p = 4 * (r + (c - q) * g), l[p] = e.r, l[p + 1] = e.g, l[p + 2] = e.b, f && (l[m + 3] = 0);
            }
            0 <= n && (p = 4 * (r + c * g), l[p] = e.r, l[p + 1] = e.g, l[p + 2] = e.b, f && (l[m + 3] = 0));
        }
        this.imageList[this.selectedImage].context.putImageData(k, b - 2 * d, a - 2 * c);
        this.redrawPart(b - d, a - c, g, h);
    }, cropImageAuto: function () {
        var b = this.imageList[this.selectedImage].context, a = b.canvas, d = a.width, c = a.height, f = [], g = [], h = b.getImageData(0, 0, a.width, a.height), e, k;
        for (k = 0; k < c; k++) {
            for (e = 0; e < d; e++) {
                var l = 4 * (k * d + e);
                0 < h.data[l + 3] && (f.push(e), g.push(k));
            }
        }
        f.sort(function (m, n) {
            return m - n;
        });
        g.sort(function (m, n) {
            return m - n;
        });
        c = f.length - 1;
        d = 1 + f[c] - f[0];
        c = 1 + g[c] - g[0];
        f = b.getImageData(f[0], g[0], d, c);
        a.width = d;
        a.height = c;
        b.putImageData(f, 0, 0);
        this.redraw();
    }, hasImageIndex: function (b) {
        return "undefined" != typeof this.imageList[b];
    }, getRGBAt: function (b, a, d) {
        if (!this.hasImageIndex(b)) {
            return 0;
        }
        a = 0 > a ? 0 : a;
        a = a > this.imageList[b].getWidth() ? this.imageList[b].getWidth() : a;
        d = 0 > d ? 0 : d;
        d = d > this.imageList[b].getWidth() ? this.imageList[b].getWidth() : d;
        b = this.imageList[b].context.getImageData(a, d, 1, 1);
        return CServices.swapRGB(b.data[0] << 16 | b.data[1] << 8 | b.data[2]);
    }, getRed: function (b, a, d) {
        if (!this.hasImageIndex(b)) {
            return 0;
        }
        a = Math.min(0, Math.max(this.imageList[b].getWidth(), a));
        d = Math.min(0, Math.max(this.imageList[b].getHeight(), d));
        return this.imageList[b].context.getImageData(a, d, 1, 1).data[0];
    }, getGreen: function (b, a, d) {
        if (!this.hasImageIndex(b)) {
            return 0;
        }
        a = Math.min(0, Math.max(this.imageList[b].getWidth(), a));
        d = Math.min(0, Math.max(this.imageList[b].getHeight(), d));
        return this.imageList[b].context.getImageData(a, d, 1, 1).data[1];
    }, getBlue: function (b, a, d) {
        if (!this.hasImageIndex(b)) {
            return 0;
        }
        a = Math.min(0, Math.max(this.imageList[b].getWidth(), a));
        d = Math.min(0, Math.max(this.imageList[b].getHeight(), d));
        return this.imageList[b].context.getImageData(a, d, 1, 1).data[2];
    }, getAlpha: function (b, a, d) {
        if (!this.hasImageIndex(b)) {
            return 0;
        }
        a = Math.min(0, Math.max(this.imageList[b].getWidth(), a));
        d = Math.min(0, Math.max(this.imageList[b].getHeight(), d));
        return this.imageList[b].context.getImageData(a, d, 1, 1).data[3];
    }, swapImages: function (b, a) {
        if (!(0 > b || b > this.nImages || 0 > a || a > this.nImages)) {
            var d = this.imageList[b];
            this.imageList[b] = this.imageList[a];
            this.imageList[a] = d;
        }
    }, deleteAlphaChannel: function () {
        this.imageList[this.selectedImage].deleteAlphaChannel();
        this.redraw();
    }, createTiledImagePattern: function (b, a, d, c) {
        var f = new OSurfacePattern;
        f.type = OSurfacePattern.TYPE_TILED_IMAGE;
        f.name = b;
        f.tiledImage = a;
        f.tiledImageOffsetX = d;
        f.tiledImageOffsetY = c;
        this.patterns[b] = f;
        this.loadBankImage(a);
    }, createLinearGradientPattern: function (b, a, d, c) {
        var f = new OSurfacePattern;
        f.type = OSurfacePattern.TYPE_LINEAR_GRADIENT;
        f.name = b;
        f.colorA = a;
        f.colorB = d;
        f.vertical = c;
        this.patterns[b] = f;
    }, createRadialGradientPattern: function (b, a, d) {
        var c = new OSurfacePattern;
        c.type = OSurfacePattern.TYPE_RADIAL_GRADIENT;
        c.name = b;
        c.colorA = a;
        c.colorB = d;
        this.patterns[b] = c;
    }, createColorPattern: function (b, a) {
        var d = new OSurfacePattern;
        d.type = OSurfacePattern.TYPE_COLOR;
        d.name = b;
        d.color = a;
        this.patterns[b] = d;
    }, createCallbackPattern: function (b) {
        var a = new OSurfacePattern;
        a.type = OSurfacePattern.TYPE_CALLBACK;
        a.name = b;
        a.callbackContext = document.createElement("canvas").getContext("2d");
        this.patterns[b] = a;
    }, getStyleByPattern: function (b, a) {
        switch (b.type) {
            case OSurfacePattern.TYPE_TILED_IMAGE:
                return a.createPattern(this.imageList[b.tiledImage].canvas, "repeat");
            case OSurfacePattern.TYPE_LINEAR_GRADIENT:
                var d = a.createLinearGradient(0, 0, b.vertical ? 0 : a.canvas.width, b.vertical ? a.canvas.height : 0);
                d.addColorStop(0, b.colorA);
                d.addColorStop(1, b.colorB);
                return d;
            case OSurfacePattern.TYPE_RADIAL_GRADIENT:
                return d = a.createRadialGradient(a.canvas.width / 2, a.canvas.height / 2, 0, a.canvas.width / 2, a.canvas.height / 2, a.canvas.width / 2), d.addColorStop(0, b.colorA), d.addColorStop(1, b.colorB), d;
            case OSurfacePattern.TYPE_COLOR:
                return b.color;
            case OSurfacePattern.TYPE_CALLBACK:
                d = a.canvas.width;
                var c = a.canvas.height;
                if (0 >= d || 0 >= c) {
                    return null;
                }
                b.callbackContext.canvas.width = d;
                b.callbackContext.canvas.height = c;
                c = b.callbackContext.getImageData(0, 0, d, c);
                for (var f = c.data, g = 0; g < f.length; g += 4) {
                    this.callback.colorReturn = !1, this.extensionObject.ho.generateEvent(CRunSurface.CND_ON_CALLBACK, b.name), this.callback.colorReturn && (f[g] = this.callback.colNew >>> 16 & 255, f[g + 1] = this.callback.colNew >>> 8 & 255, f[g + 2] = this.callback.colNew & 255, f[g + 3] = 255), this.callback.xPos = g % d, this.callback.yPos = Math.floor(g / d);
                }
                c.data = f;
                b.callbackContext.putImageData(c, 0, 0);
                return a.createPattern(b.callbackContext.canvas, "repeat");
        }
    }, hasPattern: function (b, a) {
        return "undefined" != typeof this.patterns[b];
    }, getPattern: function (b) {
        return this.hasPattern(b) ? this.patterns[b] : null;
    }, setColorOfPattern: function (b, a) {
        this.hasPattern(b) && (this.patterns[b].color = a);
    }, setColorsOfPattern: function (b, a, d) {
        this.hasPattern(b) && (this.patterns[b].colorA = a, this.patterns[b].colorB = d);
    }, setVerticalFlagOfPattern: function (b, a) {
        this.hasPattern(b) && (this.patterns[b].vertical = 1 == a);
    }, setOriginOfPattern: function (b, a, d) {
        this.hasPattern(b) && (this.patterns[b].tiledImageOffsetX = a, this.patterns[b].tiledImageOffsetY = d);
    }, setImageOfPattern: function (b, a) {
        this.hasPattern(b) && (this.patterns[b].tiledImage = a);
    }, deletePattern: function (b) {
        this.hasPattern(b) && this.patterns.splice(this.patterns.indexOf(b), 1);
    }, setBlitSourcePosition: function (b, a) {
        this.blit.xSource = b;
        this.blit.ySource = a;
    }, setBlitSourceDimension: function (b, a) {
        this.blit.wSource = b;
        this.blit.hSource = a;
    }, setBlitSourceRegionflag: function (b) {
        this.blit.regionflag = b;
    }, setBlitDestinationPosition: function (b, a) {
        this.blit.xDest = b;
        this.blit.yDest = a;
    }, setBlitDestinationDimension: function (b, a) {
        this.blit.wDest = b;
        this.blit.hDest = a;
    }, execBlit: function (b, a, d, c, f) {
        "undefined" == typeof d && (d = !1);
        "undefined" == typeof c && (c = !0);
        f = this.blit.xDest + this.getXCoord();
        var g = this.blit.yDest + this.getYCoord(), h = null != this.blit.wDest ? this.blit.wDest : b.width, e = null != this.blit.hDest ? this.blit.hDest : b.height, k = null != this.blit.wSource ? this.blit.wSource : b.width, l = null != this.blit.hSource ? this.blit.hSource : b.height, m = this.blit.regionflag ? this.blit.xSource : 0, n = this.blit.regionflag ? this.blit.ySource : 0;
        k = Math.min(k, b.width - m);
        l = Math.min(l, b.height - n);
        var r = Math.PI / 180 * this.blit.angle, p = this.blit.xHotSpot, q = this.blit.yHotSpot;
        p = Math.ceil(100 * p / k * k / 100);
        q = Math.ceil(100 * q / l * l / 100);
        this.blit.hotSpotMode & 2 && (p *= h / 100.0, q *= e / 100.0);
        var t = document.createElement("canvas").getContext("2d");
        t.canvas.width = h;
        t.canvas.height = e;
        t.drawImage(b, m, n, k, l, 0, 0, h, e);
        switch (this.blit.effect) {
            case OSurface.BLIT_EFFECT_AND:
                a.globalCompositeOperation = "multiply";
                break;
            case OSurface.BLIT_EFFECT_XOR:
                a.globalCompositeOperation = "xor";
        }
        if ("" != this.blit.callback || d) {
            a.save();
            0 != r ? (b = document.createElement("canvas").getContext("2d"), b.canvas.width = h, b.canvas.height = e, b.translate(p, q), b.rotate(r), b.translate(-p, -q), b.drawImage(a.canvas, f - p, g - q, h, e, 0, 0, h, e), b = b.getImageData(0, 0, h, e)) : b = a.getImageData(f - p, g - q, h, e);
            b = b.data;
            k = t.getImageData(0, 0, h, e);
            l = k.data;
            for (m = 0; m < b.length; m += 4) {
                if (d) {
                    l[m + 3] = b[m + 3];
                } else {
                    switch (this.blit.effect.toLowerCase()) {
                        case OSurface.BLIT_EFFECT_OR:
                            l[m] |= b[m];
                            l[m + 1] |= b[m + 1];
                            l[m + 2] |= b[m + 2];
                            break;
                        case OSurface.BLIT_EFFECT_SEMI_TRANSPARENCY:
                            l[m + 3] = this.blit.alpha;
                            break;
                        case OSurface.BLIT_EFFECT_TINT:
                            n = this.blit.tint >>> 8 & 255;
                            var u = this.blit.tint & 255;
                            l[m] = Math.max(0, Math.min(255, 0.5 * ((this.blit.tint >>> 16 & 255) - l[m]) + l[m]));
                            l[m + 1] = Math.max(0, Math.min(255, 0.5 * (n - l[m + 1]) + l[m + 1]));
                            l[m + 2] = Math.max(0, Math.min(255, 0.5 * (u - l[m + 2]) + l[m + 2]));
                    }
                    "" != this.blit.callback && (this.callback.colorReturn = !1, this.extensionObject.ho.generateEvent(CRunSurface.CND_ON_CALLBACK, this.blit.callback), this.callback.colorReturn && (l[m] = this.callback.colNew >>> 16 & 255, l[m + 1] = this.callback.colNew >>> 8 & 255, l[m + 2] = this.callback.colNew & 255, l[m + 3] = 255), this.callback.xPos = m % h, this.callback.yPos = Math.floor(m / h));
                }
            }
            k.data = l;
            t.putImageData(k, 0, 0);
        }
        a.save();
        this.blit.useTransparency || a.clearRect(f, g, h, e);
        0 != r && (a.translate(f, g), a.rotate(-r), a.translate(-f, -g));
        !this.blit.alphaComposition && c && (a.globalCompositeOperation = "source-atop");
        a.drawImage(t.canvas, f - p, g - q, h, e);
        !this.blit.alphaComposition && c && (a.globalCompositeOperation = "source-over");
        a.restore();
        a.globalCompositeOperation = "source-over";
        this.currentImage == this.selectedImage && this.redraw();
        c || (this.imageList[this.selectedImage].updateTransparent = !0);
    }, blitImage: function (b) {
        this.hasImageIndex(b) && (this.loadBankImage(b), this.execBlit(this.imageList[b].canvas, this.imageList[this.selectedImage].context, !1, this.imageList[b].hasAlphaChannel && this.imageList[this.selectedImage].hasAlphaChannel, this.imageList[this.selectedImage]));
    }, blitOntoImage: function (b, a) {
        this.hasImageIndex(b) && (this.loadBankImage(b), this.execBlit(this.imageList[this.selectedImage].context, this.imageList[b].canvas, a));
    }, blitImageHandle: function (b) {
        b = this.extensionObject.rh.rhApp.imageBank.getImageFromHandle(b);
        if (null != b) {
            var a = document.createElement("canvas").getContext("2d");
            0 == b.mosaic && null != b.img ? (a.canvas.width = b.width, a.canvas.height = b.height, a.drawImage(b.img, 0, 0)) : (a.canvas.width = b.width, a.canvas.height = b.height, a.drawImage(b.app.imageBank.mosaics[b.mosaic], b.mosaicX, b.mosaicY, b.width, b.height, 0, 0, b.width, b.height));
            this.execBlit(a.canvas, this.imageList[this.selectedImage].context, !1, this.imageList[this.selectedImage].hasAlphaChannel);
        }
    }, setBlitEffect: function (b) {
        this.blit.effect = b;
    }, pushBlitSettings: function () {
        this.savedBlit = this.blit;
    }, popBlitSettings: function () {
        null != this.savedBlit && (this.blit = this.savedBlit);
    }, newPoint: function (b, a) {
        return { x: Math.floor(b), y: Math.floor(a) };
    }, moveAllPoints: function (b, a) {
        for (var d = 0; d < this.points.length; d++) {
            this.points.x += b, this.points.y += a;
        }
    }, addPointAt: function (b, a, d) {
        0 > d ? this.points.unshift(this.newPoint(b, a)) : this.points.splice(d, 0, this.newPoint(b, a));
    }, addPoint: function (b, a) {
        this.addPointAt(b, a, this.points.length);
    }, deleteAllPoints: function () {
        this.points = [];
    }, drawPolygon: function (b, a, d, c, f) {
        if (!(3 > this.points.length)) {
            b += this.getXCoord();
            a += this.getYCoord();
            var g = this.patterns[d], h = document.createElement("canvas").getContext("2d");
            d == CServices.getColorString(this.imageList[this.selectedImage].transparentColor) && (h.globalAlpha = 1, this.context.globalCompositeOperation = "destination-in");
            for (var e = this.points[0].x, k = this.points[0].y, l = e, m = k, n = 1; n < this.points.length; n++) {
                e = Math.min(this.points[n].x, e), k = Math.min(this.points[n].y, k), l = Math.max(this.points[n].x, l), m = Math.max(this.points[n].y, m);
            }
            l = this.getRectByBox(0, 0, l - e, m - k);
            if (0 != l.w && 0 != l.h) {
                this.storeAlpha(l.x + b, l.y + a, l.w, l.h);
                h.canvas.width = l.w;
                h.canvas.height = l.h;
                h.fillStyle = this.hasPattern(d) ? this.getStyleByPattern(g, h) : d;
                h.beginPath();
                h.moveTo(this.points[0].x - e, this.points[0].y - k);
                for (n = 1; n < this.points.length; n++) {
                    h.lineTo(this.points[n].x - e, this.points[n].y - k);
                }
                h.closePath();
                -1 != d && h.fill();
                0 < c && (h.lineWidth = c, d = this.patterns[f], h.strokeStyle = this.hasPattern(f) ? this.getStyleByPattern(d, h) : f, h.stroke());
                this.restoreAlpha(l.x + b, l.y + a, l.w, l.h);
                this.context.globalCompositeOperation = "source-over";
                0 < h.canvas.width && 0 < h.canvas.height && (this.imageList[this.selectedImage].context.drawImage(h.canvas, b + e, a + k, h.canvas.width, h.canvas.height), this.redrawPart(l.x + b, l.y + a, l.w, l.h));
                this.keepPoints || this.deleteAllPoints();
            }
        }
    }, rotateAllPointsArround: function (b, a, d) {
        d = 3.1415926535 * d / 180;
        for (var c, f, g = 0; g < this.points.length; g++) {
            c = this.points[g].x - b, f = this.points[g].y - a, this.setPoint(g, Math.cos(d) * c + -Math.sin(d) * f, Math.sin(d) * c + Math.cos(d) * f);
        }
    }, setPoint: function (b, a, d) {
        "undefined" != typeof this.points[b] && (this.points[b] = this.newPoint(a, d));
    }, scaleAllPointsArround: function (b, a, d, c) {
        for (var f = 0; f < this.points.length; f++) {
            this.setPoint(f, b + d * (this.points[f].x - b), a + c * (this.points[f].y - a));
        }
    }, createRegularPolygon: function (b, a) {
        this.deleteAllPoints();
        var d = 6.283185307 / a;
        for (i = 0; i < a; i++) {
            this.addPoint(Math.cos(d * i) * b, Math.sin(d * i) * b);
        }
    }, createStar: function (b, a, d) {
        var c = 6.283185307 / (2 * d);
        for (i = 0; i < 2 * d; i++) {
            if (0 == i % 2) {
                var f = Math.cos(c * i) * b;
                var g = Math.sin(c * i) * b;
            } else {
                f = Math.cos(c * i) * a, g = Math.sin(c * i) * a;
            }
            this.addPoint(f, g);
        }
    }, drawText: function (b, a, d, c, f, g) {
        var h = document.createElement("canvas").getContext("2d");
        h.canvas.width = this.imageList[this.selectedImage].canvas.width;
        h.canvas.height = this.imageList[this.selectedImage].canvas.height;
        var e = "";
        switch (this.textParams.decoration) {
            case 1:
                e = "italic";
        }
        h.font = e + " " + 100 * this.textParams.weight + " " + this.textParams.size + " " + this.textParams.family;
        h.fillStyle = CServices.getColorString(g);
        this.getRectByBox(b, a, d, c);
        switch (this.textParams.hAlign) {
            case 0:
                h.textAlign = "left";
                break;
            case 1:
                h.textAlign = "center";
                break;
            case 2:
                h.textAlign = "right";
        }
        switch (this.textParams.vAlign) {
            case 0:
                h.textBaseline = "top";
                break;
            case 1:
                h.textBaseline = "middle";
                break;
            case 2:
                h.textBaseline = "bottom";
        }
        d = h.measureText(f).width;
        h.fillText(f, 0, 0);
        f = b + 0.5 * d;
        d = this.textParams.angle * Math.PI / 180;
        this.imageList[this.selectedImage].context.save();
        0 != this.textParams.angle && (this.imageList[this.selectedImage].context.translate(f + this.getYCoord(), a + this.getYCoord()), this.imageList[this.selectedImage].context.rotate(-d), this.imageList[this.selectedImage].context.translate(-(f + this.getYCoord()), -(a + this.getYCoord())));
        this.imageList[this.selectedImage].context.drawImage(h.canvas, b + this.getXCoord(), a + this.getYCoord());
        this.imageList[this.selectedImage].context.restore();
        this.redraw();
    }, loopThroughImageWithCallback: function (b, a, d, c, f, g, h) {
        var e = a & 1, k = a & 2, l = a & 4, m = a & 8;
        a &= 16;
        var n = 0, r = 0, p = this.imageList[this.selectedImage].getWidth(), q = this.imageList[this.selectedImage].getHeight();
        typeof c == typeof f == typeof g == typeof h == "number" && (q = this.getRectByBox(c, f, g, h), n = q.x, r = q.y, p = q.w, q = q.h);
        c = this.imageList[this.selectedImage].context.getImageData(n, r, p, q);
        this.imageList[this.selectedImage].useTransparentColor = !1;
        f = c.data;
        this.callback.xPos = 0;
        for (g = this.callback.yPos = 0; g < p * q; g++) {
            e && (this.callback.colSrc = f[4 * g] << 16 | f[4 * g + 1] << 8 | f[4 * g + 2], this.callback.colNew = this.callback.colSrc), m && (this.callback.alphaSrc = f[4 * g + 3]), l && (this.callback.xPos = g % p, this.callback.yPos = Math.floor(g / p)), this.callback.colorReturn = !1, "function" == typeof d && d(b), k && this.callback.colorReturn && (f[4 * g] = this.callback.colNew >>> 16 & 255, f[4 * g + 1] = this.callback.colNew >>> 8 & 255, f[4 * g + 2] = this.callback.colNew & 255, f[4 * g + 3] =
                255), a && this.callback.alphaReturn && (f[4 * g + 3] = this.callback.alphaNew);
        }
        k && (c.data = f, this.imageList[this.selectedImage].context.putImageData(c, n, r));
    }, setReturnColor: function (b) {
        this.callback.colorReturn || (this.callback.colNew = b, this.callback.colorReturn = !0);
    }, setReturnAlpha: function (b) {
        this.callback.alphaReturn || (b = 0 > b ? 0 : b, this.callback.alphaNew = 255 < b ? 255 : b, this.callback.alphaReturn = !0);
    }, colorsMatch: function (b, a, d) {
        var c = b[0] - a[0], f = b[1] - a[1], g = b[2] - a[2];
        b = b[3] - a[3];
        return c * c + f * f + g * g + b * b < d;
    }, setPixel: function (b, a, d, c) {
        a = 4 * (d * b.width + a);
        b.data[a + 0] = c[0];
        b.data[a + 1] = c[1];
        b.data[a + 2] = c[2];
        b.data[a + 3] = c[0];
    }, getPixel: function (b, a, d) {
        if (0 > a || 0 > d || a >= b.width || d >= b.height) {
            return [-1, -1, -1, -1];
        }
        a = 4 * (d * b.width + a);
        return b.data.slice(a, a + 4);
    }, floodFill: function (b, a, d, c) {
        c = void 0 === c ? 1 : c;
        d = [CServices.getRValueFlash(d), CServices.getGValueFlash(d), CServices.getBValueFlash(d), 255];
        var f = this.imageList[this.selectedImage].context.getImageData(0, 0, this.imageList[this.selectedImage].canvas.width, this.imageList[this.selectedImage].canvas.height), g = new Uint8Array(f.width, f.height), h = this.getPixel(f, b, a);
        if (!this.colorsMatch(h, d, c)) {
            c *= c;
            for (b = [b, a]; 0 < b.length;) {
                a = b.pop();
                var e = b.pop();
                this.floodArea.x1 = Math.min(this.floodArea.x1, e);
                this.floodArea.y1 = Math.min(this.floodArea.y1, a);
                this.floodArea.x2 = Math.max(this.floodArea.x2, e);
                this.floodArea.y2 = Math.max(this.floodArea.y2, a);
                var k = this.getPixel(f, e, a);
                !g[a * f.width + e] && this.colorsMatch(k, h, c) && (this.setPixel(f, e, a, d), g[a * f.width + e] = 1, b.push(e + 1, a), b.push(e - 1, a), b.push(e, a + 1), b.push(e, a - 1));
            }
            this.imageList[this.selectedImage].context.putImageData(f, 0, 0);
        }
        this.redraw();
    }, applyColorMatrix: function (b) {
        for (var a = this.imageList[this.selectedImage].context.getImageData(0, 0, this.imageList[this.selectedImage].getWidth(), this.imageList[this.selectedImage].getHeight()), d = a.data, c = 0; c < d.length; c += 4) {
            var f = d[c], g = d[c + 1], h = d[c + 2];
            d[c] = Math.max(0, Math.min(255, f * b[0][0] + g * b[0][1] + h * b[0][2]));
            d[c + 1] = Math.max(0, Math.min(255, f * b[1][0] + g * b[1][1] + h * b[1][2]));
            d[c + 2] = Math.max(0, Math.min(255, f * b[2][0] + g * b[2][1] + h * b[2][2]));
        }
        a.data = d;
        this.imageList[this.selectedImage].context.putImageData(a, 0, 0);
        this.redraw();
    }, applyConvolutionMatrix: function (b, a, d, c) {
        d = [].concat(c[0], c[1], c[2]);
        b || (b = d.reduce(function (r, p) {
            return r + p;
        }) || 1);
        var f = this.imageList[this.selectedImage].context.getImageData(0, 0, this.imageList[this.selectedImage].getWidth(), this.imageList[this.selectedImage].getHeight());
        c = f.data;
        f = this.imageList[this.selectedImage].context.createImageData(f);
        for (var g = f.data, h = g.length, e = 0, k = this.imageList[this.selectedImage].getWidth(), l = 0; l < h; l++) {
            if (0 === (l + 1) % 4) {
                g[l] = c[l];
            } else {
                e = 0;
                for (var m = [c[l - 4 * k - 4] || c[l], c[l - 4 * k] || c[l], c[l - 4 * k + 4] || c[l], c[l - 4] || c[l], c[l], c[l + 4] || c[l], c[l + 4 * k - 4] || c[l], c[l + 4 * k] || c[l], c[l + 4 * k + 4] || c[l]], n = 0; 9 > n; n++) {
                    e += m[n] * d[n];
                }
                e /= b;
                a && (e += a);
                g[l] = e;
            }
        }
        this.imageList[this.selectedImage].context.putImageData(f, 0, 0);
        this.redraw();
    }, moveChannels: function (b, a, d, c) {
        if ("r" != b || "g" != a || "b" != d || "a" != c) {
            var f = this.imageList[this.selectedImage].context;
            f = f.getImageData(0, 0, f.canvas.width, f.canvas.height);
            for (var g = f.data, h = g.slice(), e = 0; e < g.length; e += 4) {
                switch (b) {
                    case "g":
                        g[e] = h[e + 1];
                        break;
                    case "b":
                        g[e] = h[e + 2];
                        break;
                    case "a":
                        g[e] = h[e + 3];
                }
                switch (a) {
                    case "r":
                        g[e + 1] = h[e];
                        break;
                    case "b":
                        g[e + 1] = h[e + 2];
                        break;
                    case "a":
                        g[e + 1] = h[e + 3];
                }
                switch (d) {
                    case "r":
                        g[e + 2] = h[e];
                        break;
                    case "g":
                        g[e + 2] = h[e + 1];
                        break;
                    case "a":
                        g[e + 2] = h[e + 3];
                }
                switch (c) {
                    case "r":
                        g[e + 3] = h[e];
                        break;
                    case "g":
                        g[e + 3] = h[e + 1];
                        break;
                    case "b":
                        g[e + 3] = h[e + 2];
                }
            }
            this.imageList[this.selectedImage].context.putImageData(f, 0, 0);
            this.redraw();
        }
    }, cropImage: function (b, a, d, c) {
        var f = this.imageList[this.selectedImage].context, g = document.createElement("canvas").getContext("2d");
        d = Math.abs(d - b);
        a = Math.abs(c - a);
        var h = f.canvas.width, e = f.canvas.height;
        g.canvas.width = d;
        g.canvas.height = a;
        var k = (d - h) / 2, l = (a - e) / 2;
        g.drawImage(f.canvas, b, c, Math.max(d, h), Math.max(a, e), 0, 0, Math.max(d, h), Math.max(a, e));
        f.clearRect(0, 0, d, a);
        f.fillStyle = CServices.getColorString(this.imageList[this.selectedImage].transparentColor);
        f.fillRect(0, 0, d, a);
        f.drawImage(g.canvas, Math.min(0, k), Math.min(0, l));
    }, saveImage: function (b, a) {
        b = b.replace(/^.*[\\\/]/, "");
        var d = this.imageList[this.selectedImage].canvas.toDataURL("image/png"), c = new Image;
        c.src = d;
        window.open("", b).document.body.appendChild(c);
    }, perform: function (b, a, d) {
        var c = d.includes("r"), f = d.includes("g"), g = d.includes("b");
        d = d.includes("a");
        if ("+ - * / ** % < > & | ^ << >> =".split(" ").includes(b)) {
            var h = this.imageList[this.selectedImage].context;
            h = h.getImageData(0, 0, h.canvas.width, h.canvas.height);
            for (var e = h.data, k = 0; k < e.length; k += 4) {
                c && (e[k] = this.operation(b, e[k], a)), f && (e[k + 1] = this.operation(b, e[k + 1], a)), g && (e[k + 2] = this.operation(b, e[k + 2], a)), d && (e[k + 3] = this.operation(b, e[k + 3], a));
            }
            this.imageList[this.selectedImage].context.putImageData(h, 0, 0);
            this.redraw();
        }
    }, performColor: function (b, a) {
        var d = a >>> 16 & 255, c = a >>> 8 & 255, f = a & 255;
        if ("+ - * / ** % < > & | ^ << >> =".split(" ").includes(b)) {
            var g = this.imageList[this.selectedImage].context;
            g = g.getImageData(0, 0, g.canvas.width, g.canvas.height);
            for (var h = g.data, e = 0; e < h.length; e += 4) {
                h[e] = this.operation(b, h[e], d), h[e + 1] = this.operation(b, h[e + 1], c), h[e + 2] = this.operation(b, h[e + 2], f);
            }
            this.imageList[this.selectedImage].context.putImageData(g, 0, 0);
            this.redraw();
        }
    }, operation: function (b, a, d) {
        "/" != b && "%" != b || 0 != d || (d = 0.001);
        newVal = a;
        switch (b) {
            case "+":
                newVal = a + d;
                break;
            case "-":
                newVal = a - d;
                break;
            case "/":
                newVal = a / d;
                break;
            case "*":
                newVal = a * d;
                break;
            case "**":
                newVal = 255 * Math.pow(a / 255.0, d);
                break;
            case "%":
                newVal = a % d;
                break;
            case "<":
                newVal = Math.min(a, d);
                break;
            case ">":
                newVal = Math.max(a, d);
                break;
            case "&":
                newVal = a & d;
                break;
            case "|":
                newVal = a | d;
                break;
            case "^":
                newVal = a ^ d;
                break;
            case "<<":
                newVal = a << d;
                break;
            case ">>":
                newVal = a >> d;
                break;
            case "=":
                newVal = d;
        }
        return Math.max(0, Math.min(255, newVal));
    }
};
CRunSurface.CND_HAS_ALPHA = 0;
CRunSurface.CND_AVAILABLE_IN_CLIPBOARD = 1;
CRunSurface.CND_ON_LOADING_FAILED = 2;
CRunSurface.CND_ON_SAVING_FAILED = 3;
CRunSurface.CND_ON_LOADING_SUCCEEDED = 4;
CRunSurface.CND_ON_SAVING_SECCEEDED = 5;
CRunSurface.CND_RGB_AT = 6;
CRunSurface.CND_SELECT_IMAGE = 7;
CRunSurface.CND_ON_CALLBACK = 8;
CRunSurface.CND_DISPLAYED_IMAGE = 9;
CRunSurface.CND_SELECTED_IMAGE = 10;
CRunSurface.CND_RED_AT = 11;
CRunSurface.CND_GREEN_AT = 12;
CRunSurface.CND_BLUE_AT = 13;
CRunSurface.CND_PATTERN_EXIST = 14;
CRunSurface.CND_BUFFER_IS_LOCKED = 15;
CRunSurface.CND_IS_INSIDE_IMAGE = 16;
CRunSurface.CND_FILE_IO_IS_IN_PROGRESS = 17;
CRunSurface.CND_FILE_IS_BEHIND_SAVED = 18;
CRunSurface.CND_FILE_IS_BEHIND_LOADED = 19;
CRunSurface.CND_LAST = 20;
CRunSurface.ACT_BLIT_INTO_IMAGE = 0;
CRunSurface.ACT_DISPLAY_IMAGE = 1;
CRunSurface.ACT_SET_PIXEL_AT = 2;
CRunSurface.ACT_CLEAR_WITH_COLOR = 3;
CRunSurface.ACT_CREATE_ALPHA_CHANNEL = 4;
CRunSurface.ACT_SET_ALPHA_AT = 5;
CRunSurface.ACT_CLEAR_ALPHA_WITH = 6;
CRunSurface.ACT_DRAW_RECTANGLE_WITH_ALPHA = 7;
CRunSurface.ACT_DRAW_ELLIPSE = 8;
CRunSurface.ACT_DRAW_RECTANGLE_WITH_COLOR_AND_THICKNESS = 9;
CRunSurface.ACT_DRAW_LINE = 10;
CRunSurface.ACT_DELETE_IMAGE = 11;
CRunSurface.ACT_INSERT_IMAGE = 12;
CRunSurface.ACT_RESIZE_IMAGE = 13;
CRunSurface.ACT_SAVE_IMAGE_TO_FILE = 14;
CRunSurface.ACT_LOAD_IMAGE_FROM_FILE_OVERRIDE_EXTENSION = 15;
CRunSurface.ACT_FLOOD_FILL = 16;
CRunSurface.ACT_ADD_IMAGE = 17;
CRunSurface.ACT_DELETE_ALL_IMAGES = 18;
CRunSurface.ACT_BLIT_ONTO_IMAGE = 19;
CRunSurface.ACT_REPLACE = 20;
CRunSurface.ACT_FLIP_HORIZONTALY = 21;
CRunSurface.ACT_FLIP_VERTICALY = 22;
CRunSurface.ACT_MINIMIZE = 23;
CRunSurface.ACT_SET_TRANSPARENT_COLOR = 24;
CRunSurface.ACT_DRAW_LINE_WITH_ALPHA = 25;
CRunSurface.ACT_PERFORM_COLOR = 26;
CRunSurface.ACT_FORCE_REDRAW = 27;
CRunSurface.ACT_COPY_IMAGE = 28;
CRunSurface.ACT_SELECT_IMAGE = 29;
CRunSurface.ACT_DRAW_POLYGON = 30;
CRunSurface.ACT_INSERT_POINT = 31;
CRunSurface.ACT_REMOVE_ALL_POINTS = 32;
CRunSurface.ACT_ADD_POINT_FROM_STRING = 33;
CRunSurface.ACT_MOVE_ALL_POINTS_BY_PIXEL = 34;
CRunSurface.ACT_ROTATE_ALL_POINTS_ARROUND = 35;
CRunSurface.ACT_REMOVE_POINT = 36;
CRunSurface.ACT_SET_BLIT_TRANSPARENCY = 37;
CRunSurface.ACT_SET_BLIT_ALPHA_MODE = 38;
CRunSurface.ACT_SET_BLIT_SEMI_TRANSPARENCY = 39;
CRunSurface.ACT_SET_BLIT_EFFECT_BY_INDEX = 40;
CRunSurface.ACT_SET_BLIT_DESTINATION_POSITION = 41;
CRunSurface.ACT_SET_USE_ABSOLUTE_COORDS = 42;
CRunSurface.ACT_CREATE_COLOR_PATTERN = 43;
CRunSurface.ACT_DRAW_RECTANGLE_WITH_FILL_PATTERN = 44;
CRunSurface.ACT_CREATE_TILED_IMAGE_PATTERN = 45;
CRunSurface.ACT_CREATE_LINEAR_GRADIENT_PATTERN = 46;
CRunSurface.ACT_LOAD_IMAGE_FROM_CLIPBOARD = 47;
CRunSurface.ACT_SAVE_IMAGE_TO_CLIPBOARD = 48;
CRunSurface.ACT_BLIT_ACTIVE_OBJECT = 49;
CRunSurface.ACT_DRAW_ELLIPSE_WITH_PATTERN = 50;
CRunSurface.ACT_DRAW_POLYGON_WITH_PATTERN = 51;
CRunSurface.ACT_DRAW_TEXT = 52;
CRunSurface.ACT_SET_HORIZONTAL_TEXT_ALIGN = 53;
CRunSurface.ACT_SET_VERTICAL_TEXT_ALIGN = 54;
CRunSurface.ACT_SET_TEXT_MULTILINE = 55;
CRunSurface.ACT_SET_TEXT_FONT_FACE = 56;
CRunSurface.ACT_SET_TEXT_FONT_SIZE = 57;
CRunSurface.ACT_SET_TEXT_FONT_QUALITY = 58;
CRunSurface.ACT_SET_TEXT_FONT_WEIGHT = 59;
CRunSurface.ACT_SET_TEXT_FONT_DECORATION = 60;
CRunSurface.ACT_APPLY_CONVOLUTION_MATRIX = 61;
CRunSurface.ACT_BLIT_THE_BACKGROUND = 62;
CRunSurface.ACT_BLIT_IMAGE = 63;
CRunSurface.ACT_ADD_BACKDROP = 64;
CRunSurface.ACT_BLIT_ONTO_THE_BACKGROUND = 65;
CRunSurface.ACT_SET_BLIT_DESTINATION_DIMENSIONS = 66;
CRunSurface.ACT_BLIT_ALPHA_CHANNEL = 67;
CRunSurface.ACT_EXPORT_IMAGE_AS_OVERLAY = 68;
CRunSurface.ACT_DRAW_LINE_WITH_PATTERN = 69;
CRunSurface.ACT_BLIT_OVERLAY = 70;
CRunSurface.ACT_BLIT_ONTO_OVERLAY = 71;
CRunSurface.ACT_SET_COLOR_OF_PATTERN = 72;
CRunSurface.ACT_SET_COLORS_OF_PATTERN = 73;
CRunSurface.ACT_SET_VERTICAL_FLAG_OF_PATTERN = 74;
CRunSurface.ACT_SET_ORIGIN_OF_PATTERN = 75;
CRunSurface.ACT_SET_IMAGE_OF_PATTERN = 76;
CRunSurface.ACT_DELETE_PATTERN = 77;
CRunSurface.ACT_RESIZE_CANVAS = 78;
CRunSurface.ACT_CLEAR_WITH_PATTERN = 79;
CRunSurface.ACT_ROTATE_IMAGE = 80;
CRunSurface.ACT_SET_LINEAR_RESAMPLING = 81;
CRunSurface.ACT_BLIT_IMAGE_REFERENCED = 82;
CRunSurface.ACT_BLIT_ONTO_IMAGE_REFERENCED = 83;
CRunSurface.ACT_SET_TEXT_CLIPPING = 84;
CRunSurface.ACT_SET_TEXT_ADD_ELLIPSIS = 85;
CRunSurface.ACT_SET_TEXT_WORD_BREAK = 86;
CRunSurface.ACT_BLIT_WINDOW = 87;
CRunSurface.ACT_BLIT_ONTO_WINDOW = 88;
CRunSurface.ACT_BLIT_ONTO_IMAGE_OF_SURFACE = 89;
CRunSurface.ACT_BLIT_IMAGE_OF_SURFACE = 90;
CRunSurface.ACT_SWAP_IMAGES = 91;
CRunSurface.ACT_MOVE_CHANNELS = 92;
CRunSurface.ACT_SCROLL = 93;
CRunSurface.ACT_RETURN_COLOR_TO_CALLBACK = 94;
CRunSurface.ACT_LOOP_THROUNGH_IMAGE_WITH_CALLBACK = 95;
CRunSurface.ACT_SET_CLIPPING_RECTANGLE = 96;
CRunSurface.ACT_CLEAR_CLIPPING_RECTANGLE = 97;
CRunSurface.ACT_INVERT_IMAGE = 98;
CRunSurface.ACT_CREATE_STAR = 99;
CRunSurface.ACT_SCALE_ALL_POINTS = 100;
CRunSurface.ACT_DRAW_ELLIPSE_WITH_SIZE_AND_COLOR_THICKNESS = 101;
CRunSurface.ACT_DRAW_ELLIPSE_WITH_SIZE_AND_PATTERN = 102;
CRunSurface.ACT_CREATE_REGULAR_POLYGON = 103;
CRunSurface.ACT_SKYP_REDRAW = 104;
CRunSurface.ACT_SET_BLIT_DESTINATION = 105;
CRunSurface.ACT_CONVERT_TO_GRAYSCALE = 106;
CRunSurface.ACT_CREATE_RADIAL_GRADIENT_PATTERN = 107;
CRunSurface.ACT_SET_BLIT_EFFECT = 108;
CRunSurface.ACT_SET_DISPLAY_SELECTED_IMAGE = 109;
CRunSurface.ACT_SET_SELECT_NEW_IMAGE = 110;
CRunSurface.ACT_SET_TRANSPARENT = 111;
CRunSurface.ACT_LOCK_BUFFER = 112;
CRunSurface.ACT_UNLOCK_BUFFER = 113;
CRunSurface.ACT_SET_BLIT_SOURCE_POSITION = 114;
CRunSurface.ACT_SET_BLIT_SOURCE_DIMENSIONS = 115;
CRunSurface.ACT_SET_BLIT_STRETCH_MODE = 116;
CRunSurface.ACT_SET_BLIT_REGION_FLAG = 117;
CRunSurface.ACT_SET_TEXT_ANGLE = 118;
CRunSurface.ACT_DRAW_RECTANGLE_WITH_SIZE_AND_COLOR_OUTLINE = 119;
CRunSurface.ACT_DRAW_RECTANGLE_WITH_SIZE_AND_PATTERN = 120;
CRunSurface.ACT_COPY_IMAGE_FROM_IMAGE_SURFACE = 121;
CRunSurface.ACT_BLIT_ACTIVE_OBJECT_AT_POSITION = 122;
CRunSurface.ACT_PERFORM_WITH_CHANNEL = 123;
CRunSurface.ACT_BLIT_ALPHA_CHANNEL_ONTO_IMAGE = 124;
CRunSurface.ACT_BLIT_IMAGE_ALPHA_CHANNEL_ONTO_ALPHA_CHANNEL = 125;
CRunSurface.ACT_SET_BLIT_EFFECT_BY_NAME = 126;
CRunSurface.ACT_REMOVE_ALPHA_CHANNEL = 127;
CRunSurface.ACT_WRITE_BYTES = 128;
CRunSurface.ACT_ADD_IMAGE_REFERENCE_FOR = 129;
CRunSurface.ACT_INSERT_IMAGE_REFERENCE_FOR = 130;
CRunSurface.ACT_COPY_IMAGE_FROM_IMAGE_REFERENCED = 131;
CRunSurface.ACT_SET_REFERENCE_VALUE_OF_IMAGE = 132;
CRunSurface.ACT_SET_REFERENCE_STATE_OF_IMAGE = 133;
CRunSurface.ACT_SET_KEEP_POINTS_AFTER_DRAWING = 134;
CRunSurface.ACT_SET_BACKGROUND_FILE_INPUT_OUTPUT = 135;
CRunSurface.ACT_SET_BLIT_CALLBACK_TO = 136;
CRunSurface.ACT_LOOP_THROUGH_WITH_CALLBACK = 137;
CRunSurface.ACT_RETURN_ALPHA_TO_CALLBACK = 138;
CRunSurface.ACT_SET_SCALE = 139;
CRunSurface.ACT_SET_X_SCALE = 140;
CRunSurface.ACT_SET_Y_SCALE = 141;
CRunSurface.ACT_ADD_POINT = 142;
CRunSurface.ACT_SET_HOT_SPOT_TO_PX = 143;
CRunSurface.ACT_SET_HOT_SPOT_TO_PERCENT = 144;
CRunSurface.ACT_CREATE_CALLBACK_PATTERN = 145;
CRunSurface.ACT_SET_BLIT_SOURCE = 146;
CRunSurface.ACT_SET_BLIT_ANGLE = 147;
CRunSurface.ACT_SET_BLIT_HOT_SPOT = 148;
CRunSurface.ACT_SET_BLIT_HOT_SPOT_FLAG = 149;
CRunSurface.ACT_SET_BLIT_HOT_SPOT_PERCENT = 150;
CRunSurface.ACT_SET_BLIT_ROTATION_QUALITY = 151;
CRunSurface.ACT_SET_ANGLE = 152;
CRunSurface.ACT_LOAD_IMAGE_FROM_FILE = 153;
CRunSurface.ACT_CONVERT_TO_HWA_TEXTURE = 154;
CRunSurface.ACT_CONVERT_TO_HWA_TARGET = 155;
CRunSurface.ACT_CONVERT_TO_BITMAP = 156;
CRunSurface.ACT_SET_BLIT_TINT = 157;
CRunSurface.ACT_DRAW_ELLIPSE_WITH_COLOR = 158;
CRunSurface.ACT_DRAW_RECTANGLE_WITH_COLOR = 159;
CRunSurface.ACT_DRAW_POLYGON_WITH_COLOR = 160;
CRunSurface.ACT_APPLY_COLOR_MATRIX = 161;
CRunSurface.ACT_STORE_IMAGE = 162;
CRunSurface.ACT_RESTORE_IMAGE = 163;
CRunSurface.ACT_APPLY_BRIGHTNESS = 164;
CRunSurface.ACT_APPLY_CONTRAST = 165;
CRunSurface.ACT_DRAW_RECTANGLE_WITH_SIZE_AND_COLOR = 166;
CRunSurface.ACT_DRAW_ELLIPSE_WITH_SIZE_AND_COLOR = 167;
CRunSurface.ACT_SET_BLIT_ALPHA = 168;
CRunSurface.ACT_PUSH_BLIT_SETTINGS = 169;
CRunSurface.ACT_POP_BLIT_SETTINGS = 170;
CRunSurface.ACT_ENABLE_BLIT_ALPHA_COMPOSITION = 171;
CRunSurface.ACT_DISABLE_BLIT_ALPHA_COMPOSITION = 172;
CRunSurface.ACT_ENABLE_BLIT_ALPHA_TRANSPARENCY = 173;
CRunSurface.ACT_DISABLE_BLIT_ALPHA_TRANSPARENCY = 174;
CRunSurface.EXP_IMAGE_COUNT = 0;
CRunSurface.EXP_SEL_IMAGE = 1;
CRunSurface.EXP_DISPLAY_IMAGE = 2;
CRunSurface.EXP_RGB_AT = 3;
CRunSurface.EXP_WIDTH = 4;
CRunSurface.EXP_HEIGHT = 5;
CRunSurface.EXP_LAST_IMAGE = 6;
CRunSurface.EXP_EXPORTED_OVL_ADDRESS = 7;
CRunSurface.EXP_DISPLAY_WIDTH = 8;
CRunSurface.EXP_DISPLAY_HEIGHT = 9;
CRunSurface.EXP_RED_AT = 10;
CRunSurface.EXP_GREEN_AT = 11;
CRunSurface.EXP_BLUE_AT = 12;
CRunSurface.EXP_ALPHA_AT = 13;
CRunSurface.EXP_IMG_RGB_AT = 14;
CRunSurface.EXP_IMG_WIDTH = 15;
CRunSurface.EXP_IMG_HEIGHT = 16;
CRunSurface.EXP_CALLBACK_X = 17;
CRunSurface.EXP_CALLBACK_Y = 18;
CRunSurface.EXP_CALLBACK_AREA_X1 = 19;
CRunSurface.EXP_CALLBACK_AREA_Y1 = 20;
CRunSurface.EXP_CALLBACK_AREA_X2 = 21;
CRunSurface.EXP_CALLBACK_AREA_Y2 = 22;
CRunSurface.EXP_RGB = 23;
CRunSurface.EXP_BLEND = 24;
CRunSurface.EXP_INVERT = 25;
CRunSurface.EXP_MULTIPLY = 26;
CRunSurface.EXP_TRANSP_COLOR = 27;
CRunSurface.EXP_FILTER_COUNT = 28;
CRunSurface.EXP_FILTER = 29;
CRunSurface.EXP_FILTER_EXT = 30;
CRunSurface.EXP_FILTER_EXT_COUNT = 31;
CRunSurface.EXP_FILTER_CAN_SAVE = 32;
CRunSurface.EXP_BUFFER_ADDR = 33;
CRunSurface.EXP_BUFFER_PITCH = 34;
CRunSurface.EXP_FILTER_ALL_EXTS = 35;
CRunSurface.EXP_FLOOD_X1 = 36;
CRunSurface.EXP_FLOOD_Y1 = 37;
CRunSurface.EXP_FLOOD_X2 = 38;
CRunSurface.EXP_FLOOD_Y2 = 39;
CRunSurface.EXP_PATTERN = 40;
CRunSurface.EXP_PATTERN_COUNT = 41;
CRunSurface.EXP_PATTERN_COLOR = 42;
CRunSurface.EXP_PATTERN_COLOR_A = 43;
CRunSurface.EXP_PATTERN_COLOR_B = 44;
CRunSurface.EXP_PATTERN_IMAGE = 45;
CRunSurface.EXP_IMG_RED_AT = 46;
CRunSurface.EXP_IMG_GREEN_AT = 47;
CRunSurface.EXP_IMG_BLUE_AT = 48;
CRunSurface.EXP_IMG_ALPHA_AT = 49;
CRunSurface.EXP_HEX_TO_RGB = 50;
CRunSurface.EXP_RANDOM_COLOR = 51;
CRunSurface.EXP_SEL_IMG_REF = 52;
CRunSurface.EXP_IMG_REF = 53;
CRunSurface.EXP_CALLBACK_SRC_COL = 54;
CRunSurface.EXP_CALLBACK_DEST_COL = 55;
CRunSurface.EXP_OBJ_IMG_REF = 56;
CRunSurface.EXP_BG_IMG_REF = 57;
CRunSurface.EXP_CALLBACK_SRC_ALPHA = 58;
CRunSurface.EXP_FRAME_WINDOW_HANDLE = 59;
CRunSurface.EXP_IMG_HOT_X = 60;
CRunSurface.EXP_IMG_HOT_Y = 61;
CRunSurface.EXP_HOT_X = 62;
CRunSurface.EXP_HOT_Y = 63;
CRunSurface.EXP_IMG_TRANSP_COLOR = 64;
CRunSurface.EXP_CALLBACK_DEST_ALPHA = 65;
CRunSurface.EXP_ADD = 66;
CRunSurface.EXP_SUBSTRACT = 67;
CRunSurface.EXP_TRANSFORMED_SURFACE_ADDR = 68;
CRunSurface.EXP_X_SCALE = 69;
CRunSurface.EXP_Y_SCALE = 70;
CRunSurface.EXP_ANGLE = 71;
CRunSurface.EXP_SCREEN_TO_IMG_X = 72;
CRunSurface.EXP_SCREEN_TO_IMG_Y = 73;
CRunSurface.EXP_PATTERN_TYPE = 74;
CRunSurface.EXP_COMPOSED_COLOR = 75;
CRunSurface.EXP_COMPOSED_ALPHA = 76;
function CRunSurface() {
    this.oSurf = new OSurface;
    this.canvas = document.createElement("canvas");
    this.context = this.canvas.getContext("2d");
    this.fileIOinProgress = this.loadFirstImageOnStart = this.flipVerticaly = this.flipHorizontaly = !1;
    this.appContext = null;
}
CRunSurface.prototype = CServices.extend(new CRunExtension, {
    getNumberOfCondition: function () {
        return CRunSurface.CND_LAST;
    }, createRunObject: function (b, a, d) {
        this.oSurf.setW(b.readAShort());
        this.oSurf.setH(b.readAShort());
        this.ho.hoImgWidth = this.oSurf.w;
        this.ho.hoImgHeight = this.oSurf.h;
        this.oSurf.w_def = b.readAShort();
        this.oSurf.h_def = b.readAShort();
        d = Array(this.oSurf.MAX_IMAGES);
        var c;
        for (c = 0; c < this.oSurf.MAX_IMAGES; c++) {
            var f = b.readAShort();
            0 < f && (d[c] = f);
        }
        this.oSurf.nImages = b.readAShort();
        this.oSurf.imageList = Array(this.oSurf.nImages);
        f = [];
        for (c = 0; c < this.oSurf.nImages; c++) {
            this.oSurf.imageList[c] = new OSurfaceImage, this.oSurf.imageList[c].imageHandle = d[c], f[c] = this.oSurf.imageList[c].imageHandle;
        }
        0 == this.oSurf.imageList.length && (this.oSurf.nImages = 1, d = new OSurfaceImage, d.w = this.oSurf.w, d.h = this.oSurf.h, this.oSurf.imageList[0] = d);
        this.canvas.width = this.oSurf.w;
        this.canvas.height = this.oSurf.h;
        0 < this.oSurf.nImages ? (this.ho.loadImageList(f), this.oSurf.currentImage = 0, this.oSurf.selectedImage = 0, this.ho.roc.rcImage = this.oSurf.currentImage) : (this.oSurf.selectedImage = -1, this.oSurf.currentImage = -1);
        this.oSurf.x = a.cobX;
        this.oSurf.y = a.cobY;
        this.oSurf.globalContext = this.context;
        this.oSurf.extensionObject = this;
        this.loadFirstImageOnStart = 1 == b.readAByte();
        this.oSurf.useAbsoluteCoordinates = 1 == b.readAByte();
        this.oSurf.threadedIO = 1 == b.readAByte();
        this.oSurf.keepPoints = 1 == b.readAByte();
        this.oSurf.multiImg = 1 == b.readAByte();
        this.oSurf.dispTarget = 1 == b.readAByte();
        this.oSurf.selectLast = 1 == b.readAByte();
        b.skipBytes(3);
        b = this.ho.hoAdRunHeader.rhApp.bUnicode ? b.readLogFont() : b.readLogFont16();
        this.oSurf.textParams.family = b.lfFaceName;
        this.oSurf.textParams.size = b.lfHeight + "pt";
        this.oSurf.textParams.weigth = b.lfWeight / 100;
        return !1;
    }, handleRunObject: function () {
        this.loadFirstImageOnStart && (this.oSurf.setSelectedImage(0), this.oSurf.setCurrentImage(0), this.oSurf.redraw());
        return CRunExtension.REFLAG_ONESHOT;
    }, displayRunObject: function (b, a, d) {
        null == this.appContext && (this.appContext = b._context);
        a = this.ho.hoX - this.rh.rhWindowX + this.ho.pLayer.x + a;
        d = this.ho.hoY - this.rh.rhWindowY + this.ho.pLayer.y + d;
        var c = this.oSurf.w, f = this.oSurf.h;
        this.oSurf.redrawTransparentColor(0, 0, this.oSurf.imageList[this.oSurf.currentImage].getWidth(), this.oSurf.imageList[this.oSurf.currentImage].getHeight());
        if ("undefined" != typeof this.oSurf.imageList[this.oSurf.currentImage]) {
            b._context.save();
            this.oSurf.imageList[this.oSurf.currentImage].context.save();
            if (0 != this.oSurf.imageList[this.oSurf.currentImage].xScale || 0 != this.oSurf.imageList[this.oSurf.currentImage].yScale) {
                var g = 100 * this.oSurf.imageList[this.oSurf.currentImage].hotSpot.x / c, h = 100 * this.oSurf.imageList[this.oSurf.currentImage].hotSpot.y / f;
                c *= this.oSurf.imageList[this.oSurf.currentImage].xScale;
                f *= this.oSurf.imageList[this.oSurf.currentImage].yScale;
                a -= Math.ceil(g * c / 100);
                d -= Math.ceil(h * f / 100);
                b._context.mozImageSmoothingEnabled = this.oSurf.imageList[this.oSurf.currentImage].smoothScale;
                b._context.webkitImageSmoothingEnabled = this.oSurf.imageList[this.oSurf.currentImage].smoothScale;
                b._context.msImageSmoothingEnabled = this.oSurf.imageList[this.oSurf.currentImage].smoothScale;
                b._context.imageSmoothingEnabled = this.oSurf.imageList[this.oSurf.currentImage].smoothScale;
            }
            0 != this.oSurf.imageList[this.oSurf.currentImage].rotation && (g = a, h = d, b._context.translate(g, h), b._context.rotate(-(this.oSurf.imageList[this.oSurf.currentImage].rotation * Math.PI / 180)), a -= g, d -= h);
            b.renderSimpleImage(this.oSurf.imageList[this.oSurf.currentImage].canvas, a, d, c, f, 0, 0);
            b._context.restore();
            this.oSurf.imageList[this.oSurf.currentImage].context.restore();
        }
    }, getParamColour: function (b, a) {
        return b.getParamColour(this.rh, a);
    }, condition: function (b, a) {
        switch (b) {
            case CRunSurface.CND_HAS_ALPHA:
                return this.oSurf.hasAlpha(this.oSurf.selectedImage);
            case CRunSurface.CND_RGB_AT:
                var d = a.getParamExpression(this.rh, 0), c = a.getParamExpression(this.rh, 1), f = a.getParamExpression(this.rh, 2);
                return this.oSurf.getRGBAt(this.oSurf.selectedImage, d, c) == f;
            case CRunSurface.CND_PATTERN_EXIST:
                return d = a.getParamExpString(this.rh, 0), this.oSurf.hasPattern(d);
            case CRunSurface.CND_RED_AT:
                return d = a.getParamExpression(this.rh, 0), c = a.getParamExpression(this.rh, 1), f = a.getParamExpression(this.rh, 2), this.oSurf.getRed(this.oSurf.selectedImage, d, c) == f;
            case CRunSurface.CND_GREEN_AT:
                return d = a.getParamExpression(this.rh, 0), c = a.getParamExpression(this.rh, 1), f = a.getParamExpression(this.rh, 2), this.oSurf.getGreen(this.oSurf.selectedImage, d, c) == f;
            case CRunSurface.CND_BLUE_AT:
                return d = a.getParamExpression(this.rh, 0), c = a.getParamExpression(this.rh, 1), f = a.getParamExpression(this.rh, 2), this.oSurf.getBlue(this.oSurf.selectedImage, d, c) == f;
            case CRunSurface.CND_FILE_IS_BEHIND_LOADED:
                return this.oSurf.imageList[this.oSurf.selectedImage].fileLoaded;
            case CRunSurface.CND_ON_LOADING_SUCCEEDED:
                return !0;
            case CRunSurface.CND_ON_LOADING_FAILED:
                return !0;
            case CRunSurface.CND_DISPLAYED_IMAGE:
                return d = a.getParamExpression(this.rh, 0), this.oSurf.currentImage == d;
            case CRunSurface.CND_SELECTED_IMAGE:
                return d = a.getParamExpression(this.rh, 0), this.oSurf.selectedImage == d;
            case CRunSurface.CND_SELECT_IMAGE:
                return d = a.getParamExpression(this.rh, 0), this.oSurf.setSelectedImage(d), this.oSurf.currentImage == d && this.oSurf.redraw(), !0;
            case CRunSurface.CND_IS_INSIDE_IMAGE:
                return d = a.getParamExpression(this.rh, 0), c = a.getParamExpression(this.rh, 1), 0 < d && 0 < c && d < this.oSurf.w && c < this.oSurf.h;
            case CRunSurface.CND_ON_CALLBACK:
                return d = a.getParamExpString(this.rh, 0), d == this.rh.rhEvtProg.rhCurParam0;
            case CRunSurface.CND_FILE_IO_IS_IN_PROGRESS:
                return this.oSurf.fileIOinProgress;
        }
        return !1;
    }, action: function (b, a) {
        var d = this;
        switch (b) {
            case CRunSurface.ACT_CREATE_ALPHA_CHANNEL:
                this.oSurf.imageList[this.oSurf.selectedImage].hasAlphaChannel = !0;
                break;
            case CRunSurface.ACT_FORCE_REDRAW:
                this.oSurf.skipRedraw = !1;
                this.oSurf.redraw();
                break;
            case CRunSurface.ACT_SET_DISPLAY_SELECTED_IMAGE:
                var c = a.getParamExpression(this.rh, 0);
                this.oSurf.dispTarget = 1 == c;
                break;
            case CRunSurface.ACT_SET_USE_ABSOLUTE_COORDS:
                c = a.getParamExpression(this.rh, 0);
                this.oSurf.useAbsoluteCoordinates = 1 == c;
                break;
            case CRunSurface.ACT_SET_KEEP_POINTS_AFTER_DRAWING:
                c = a.getParamExpression(this.rh, 0);
                this.oSurf.keepPoints = 1 == c;
                break;
            case CRunSurface.CND_FILE_IO_IS_IN_PROGRESS:
                return this.oSurf.fileIOinProgress;
            case CRunSurface.ACT_DELETE_IMAGE:
                var f = a.getParamExpression(this.rh, 0);
                this.TargetImage.deleteImage(f);
                break;
            case CRunSurface.ACT_INSERT_IMAGE:
                f = a.getParamExpression(this.rh, 0);
                var g = a.getParamExpression(this.rh, 1), h = a.getParamExpression(this.rh, 2);
                this.oSurf.insertImageAt(f, g, h);
                break;
            case CRunSurface.ACT_ADD_IMAGE:
                g = a.getParamExpression(this.rh, 0);
                h = a.getParamExpression(this.rh, 1);
                this.oSurf.insertImageAt(this.oSurf.imageList.length, g, h);
                break;
            case CRunSurface.ACT_DELETE_ALL_IMAGES:
                this.oSurf.deleteAllImages();
                break;
            case CRunSurface.ACT_SET_TRANSPARENT_COLOR:
                c = this.getParamColour(a, 0);
                var e = a.getParamExpression(this.rh, 1);
                this.oSurf.setTransparentColor(this.oSurf.selectedImage, CServices.getColorString(c), 1 == e);
                break;
            case CRunSurface.ACT_SET_TRANSPARENT:
                c = a.getParamExpression(this.rh, 0);
                this.oSurf.setTransparent(1 == c);
                break;
            case CRunSurface.ACT_CLEAR_WITH_COLOR:
                c = this.getParamColour(a, 0);
                this.oSurf.clearWithColor(CServices.getColorString(c));
                break;
            case CRunSurface.ACT_CLEAR_ALPHA_WITH:
                c = a.getParamExpression(this.rh, 0);
                this.oSurf.clearWithAlpha(c);
                break;
            case CRunSurface.ACT_CLEAR_WITH_PATTERN:
                c = a.getParamExpString(this.rh, 0);
                this.oSurf.drawRect(0, 0, this.oSurf.w, this.oSurf.h, c);
                break;
            case CRunSurface.ACT_SET_PIXEL_AT:
                e = a.getParamExpression(this.rh, 0);
                var k = a.getParamExpression(this.rh, 1);
                c = this.getParamColour(a, 2);
                this.oSurf.drawRect(e, k, 1, 1, CServices.getColorString(c));
                break;
            case CRunSurface.ACT_REPLACE:
                c = this.getParamColour(a, 0);
                e = this.getParamColour(a, 1);
                this.oSurf.replaceColor(this.TargetImage.selectedImage, c, e);
                break;
            case CRunSurface.ACT_DRAW_LINE:
                e = a.getParamExpression(this.rh, 0);
                k = a.getParamExpression(this.rh, 1);
                g = a.getParamExpression(this.rh, 2);
                h = a.getParamExpression(this.rh, 3);
                c = this.getParamColour(a, 4);
                f = a.getParamExpression(this.rh, 5);
                this.oSurf.drawLine(e, k, g, h, CServices.getColorString(c), f);
                break;
            case CRunSurface.ACT_DRAW_LINE_WITH_ALPHA:
                e = a.getParamExpression(this.rh, 0);
                k = a.getParamExpression(this.rh, 1);
                g = a.getParamExpression(this.rh, 2);
                h = a.getParamExpression(this.rh, 3);
                c = a.getParamExpression(this.rh, 4);
                this.oSurf.drawHardLine(e, k, g, h, null, c);
                break;
            case CRunSurface.ACT_DRAW_LINE_WITH_PATTERN:
                e = a.getParamExpression(this.rh, 0);
                k = a.getParamExpression(this.rh, 1);
                g = a.getParamExpression(this.rh, 2);
                h = a.getParamExpression(this.rh, 3);
                c = a.getParamExpString(this.rh, 4);
                f = a.getParamExpression(this.rh, 5);
                this.oSurf.drawLine(e, k, g, h, c, f);
                break;
            case CRunSurface.ACT_DRAW_RECTANGLE_WITH_ALPHA:
                e = a.getParamExpression(this.rh, 0);
                k = a.getParamExpression(this.rh, 1);
                g = a.getParamExpression(this.rh, 2);
                h = a.getParamExpression(this.rh, 3);
                c = a.getParamExpression(this.rh, 4);
                this.oSurf.drawHardRect(e, k, Math.abs(g - e), Math.abs(h - k), null, c);
                break;
            case CRunSurface.ACT_DRAW_RECTANGLE_WITH_COLOR_AND_THICKNESS:
                e = a.getParamExpression(this.rh, 0);
                k = a.getParamExpression(this.rh, 1);
                g = a.getParamExpression(this.rh, 2);
                h = a.getParamExpression(this.rh, 3);
                c = this.getParamColour(a, 4);
                f = a.getParamExpression(this.rh, 5);
                var l = this.getParamColour(a, 6);
                e = this.oSurf.getRectByBox(e, k, g, h);
                this.oSurf.drawRect(e.x, e.y, e.w, e.h, CServices.getColorString(c), f, CServices.getColorString(l));
                break;
            case CRunSurface.ACT_DRAW_RECTANGLE_WITH_COLOR:
                e = a.getParamExpression(this.rh, 0);
                k = a.getParamExpression(this.rh, 1);
                g = a.getParamExpression(this.rh, 2);
                h = a.getParamExpression(this.rh, 3);
                c = this.getParamColour(a, 4);
                e = this.oSurf.getRectByBox(e, k, g, h);
                this.oSurf.drawRect(e.x, e.y, e.w, e.h, CServices.getColorString(c));
                break;
            case CRunSurface.ACT_DRAW_RECTANGLE_WITH_SIZE_AND_COLOR_OUTLINE:
                e = a.getParamExpression(this.rh, 0);
                k = a.getParamExpression(this.rh, 1);
                g = a.getParamExpression(this.rh, 2);
                h = a.getParamExpression(this.rh, 3);
                c = this.getParamColour(a, 4);
                f = a.getParamExpression(this.rh, 5);
                l = this.getParamColour(a, 6);
                this.oSurf.drawRect(e, k, g, h, CServices.getColorString(c), f, CServices.getColorString(l));
                break;
            case CRunSurface.ACT_DRAW_RECTANGLE_WITH_SIZE_AND_COLOR:
                e = a.getParamExpression(this.rh, 0);
                k = a.getParamExpression(this.rh, 1);
                g = a.getParamExpression(this.rh, 2);
                h = a.getParamExpression(this.rh, 3);
                c = this.getParamColour(a, 4);
                this.oSurf.drawRect(e, k, g, h, CServices.getColorString(c));
                break;
            case CRunSurface.ACT_DRAW_ELLIPSE:
                e = a.getParamExpression(this.rh, 0);
                k = a.getParamExpression(this.rh, 1);
                g = a.getParamExpression(this.rh, 2);
                h = a.getParamExpression(this.rh, 3);
                c = this.getParamColour(a, 4);
                f = a.getParamExpression(this.rh, 5);
                l = this.getParamColour(a, 6);
                e = this.oSurf.getRectByBox(e, k, g, h);
                e = this.oSurf.getEllipseByRect(e.x, e.y, e.w, e.h);
                this.oSurf.drawEllipse(e.xCenter, e.yCenter, e.xRadius, e.yRadius, CServices.getColorString(c), f, CServices.getColorString(l));
                break;
            case CRunSurface.ACT_DRAW_ELLIPSE_WITH_COLOR:
                e = a.getParamExpression(this.rh, 0);
                k = a.getParamExpression(this.rh, 1);
                g = a.getParamExpression(this.rh, 2);
                h = a.getParamExpression(this.rh, 3);
                c = this.getParamColour(a, 4);
                e = this.oSurf.getRectByBox(e, k, g, h);
                e = this.oSurf.getEllipseByRect(e.x, e.y, e.w, e.h);
                this.oSurf.drawEllipse(e.xCenter, e.yCenter, e.xRadius, e.yRadius, CServices.getColorString(c));
                break;
            case CRunSurface.ACT_DRAW_ELLIPSE_WITH_SIZE_AND_COLOR_THICKNESS:
                e = a.getParamExpression(this.rh, 0);
                k = a.getParamExpression(this.rh, 1);
                g = a.getParamExpression(this.rh, 2);
                h = a.getParamExpression(this.rh, 3);
                c = this.getParamColour(a, 4);
                f = a.getParamExpression(this.rh, 5);
                l = this.getParamColour(a, 6);
                e = this.oSurf.getEllipseByRect(e, k, g, h);
                this.oSurf.drawEllipse(e.xCenter, e.yCenter, e.xRadius, e.yRadius, CServices.getColorString(c), f, CServices.getColorString(l));
                break;
            case CRunSurface.ACT_DRAW_ELLIPSE_WITH_SIZE_AND_COLOR:
                e = a.getParamExpression(this.rh, 0);
                k = a.getParamExpression(this.rh, 1);
                g = a.getParamExpression(this.rh, 2);
                h = a.getParamExpression(this.rh, 3);
                c = this.getParamColour(a, 4);
                e = this.oSurf.getEllipseByRect(e, k, g, h);
                this.oSurf.drawEllipse(e.xCenter, e.yCenter, e.xRadius, e.yRadius, CServices.getColorString(c));
                break;
            case CRunSurface.ACT_APPLY_BRIGHTNESS:
                c = a.getParamExpDouble(this.rh, 0);
                this.oSurf.setBrightness(c);
                break;
            case CRunSurface.ACT_APPLY_CONTRAST:
                c = a.getParamExpDouble(this.rh, 0);
                this.oSurf.setContrast(c);
                break;
            case CRunSurface.ACT_INVERT_IMAGE:
                this.oSurf.invertColors();
                break;
            case CRunSurface.ACT_CONVERT_TO_GRAYSCALE:
                this.oSurf.convertToGrayscale();
                break;
            case CRunSurface.ACT_REMOVE_ALPHA_CHANNEL:
                this.oSurf.deleteAlphaChannel();
                break;
            case CRunSurface.ACT_FLIP_HORIZONTALY:
                this.oSurf.flipHorizontaly();
                break;
            case CRunSurface.ACT_FLIP_VERTICALY:
                this.oSurf.flipVerticaly();
                break;
            case CRunSurface.ACT_SCROLL:
                this.oSurf.scroll(a.getParamExpression(this.rh, 0), a.getParamExpression(this.rh, 1), a.getParamExpression(this.rh, 2));
                break;
            case CRunSurface.ACT_SET_HOT_SPOT_TO_PX:
                e = a.getParamExpression(this.rh, 0);
                k = a.getParamExpression(this.rh, 1);
                this.oSurf.setHotSpotX(e);
                this.oSurf.setHotSpotY(k);
                break;
            case CRunSurface.ACT_SET_HOT_SPOT_TO_PERCENT:
                e = a.getParamExpression(this.rh, 0);
                c = a.getParamExpression(this.rh, 1);
                e = e / 100.0 * this.oSurf.imageList[this.oSurf.selectedImage].getWidth();
                k = c / 100.0 * this.oSurf.imageList[this.oSurf.selectedImage].getHeight();
                this.oSurf.setHotSpotX(e);
                this.oSurf.setHotSpotY(k);
                break;
            case CRunSurface.ACT_RESIZE_IMAGE:
                g = a.getParamExpression(this.rh, 0);
                h = a.getParamExpression(this.rh, 1);
                this.oSurf.resizeImage(g, h);
                break;
            case CRunSurface.ACT_ROTATE_IMAGE:
                c = a.getParamExpression(this.rh, 0);
                this.oSurf.rotateImage(c);
                break;
            case CRunSurface.ACT_SET_ANGLE:
                c = a.getParamExpression(this.rh, 0);
                this.oSurf.setAngle(c);
                break;
            case CRunSurface.ACT_SET_SCALE:
                c = a.getParamExpression(this.rh, 0);
                e = a.getParamExpression(this.rh, 1);
                this.oSurf.imageList[this.oSurf.selectedImage].xScale = c;
                this.oSurf.imageList[this.oSurf.selectedImage].yScale = c;
                this.oSurf.imageList[this.oSurf.selectedImage].smoothScale = 1 == parseInt(e);
                break;
            case CRunSurface.ACT_SET_X_SCALE:
                c = a.getParamExpression(this.rh, 0);
                e = a.getParamExpression(this.rh, 1);
                this.oSurf.imageList[this.oSurf.selectedImage].xScale = c;
                this.oSurf.imageList[this.oSurf.selectedImage].smoothScale = 1 == parseInt(e);
                break;
            case CRunSurface.ACT_SET_Y_SCALE:
                c = a.getParamExpression(this.rh, 0);
                e = a.getParamExpression(this.rh, 1);
                this.oSurf.imageList[this.oSurf.selectedImage].yScale = c;
                this.oSurf.imageList[this.oSurf.selectedImage].smoothScale = 1 == parseInt(e);
                break;
            case CRunSurface.ACT_SELECT_IMAGE:
                c = a.getParamExpression(this.rh, 0);
                this.oSurf.setSelectedImage(c);
                break;
            case CRunSurface.ACT_DISPLAY_IMAGE:
                c = a.getParamExpression(this.rh, 0);
                this.oSurf.setCurrentImage(c);
                break;
            case CRunSurface.ACT_COPY_IMAGE:
                c = a.getParamExpression(this.rh, 0);
                e = a.getParamExpression(this.rh, 1);
                this.oSurf.copyImage(c, e);
                break;
            case CRunSurface.ACT_COPY_IMAGE_FROM_IMAGE_SURFACE:
                c = a.getParamExpression(this.rh, 0);
                k = a.getParamObject(this.rh, 1);
                e = a.getParamExpression(this.rh, 2);
                k = k.ext.oSurf;
                "undefined" != typeof k && k.hasImageIndex(e) && (k.loadBankImage(e), this.oSurf.copyImageFromCanvas(c, k.imageList[e].canvas));
                break;
            case CRunSurface.ACT_SET_ALPHA_AT:
                e = a.getParamExpression(this.rh, 0);
                k = a.getParamExpression(this.rh, 1);
                c = a.getParamExpression(this.rh, 2);
                this.oSurf.setAlpha(this.oSurf.selectedImage, e, k, c);
                break;
            case CRunSurface.ACT_SWAP_IMAGES:
                c = a.getParamExpression(this.rh, 0);
                e = a.getParamExpression(this.rh, 1);
                this.oSurf.swapImages(c, e);
                this.oSurf.setSelectedImage(this.oSurf.selectedImage);
                this.oSurf.setCurrentImage(this.oSurf.currentImage);
                break;
            case CRunSurface.ACT_STORE_IMAGE:
                this.oSurf.quickStoreImage();
                break;
            case CRunSurface.ACT_RESTORE_IMAGE:
                this.oSurf.quickRestoreImage();
                this.oSurf.redraw();
                break;
            case CRunSurface.ACT_CREATE_TILED_IMAGE_PATTERN:
                var m = a.getParamExpString(this.rh, 0);
                c = a.getParamExpression(this.rh, 1);
                e = a.getParamExpression(this.rh, 2);
                k = a.getParamExpression(this.rh, 3);
                this.oSurf.createTiledImagePattern(m, c, e, k);
                break;
            case CRunSurface.ACT_CREATE_LINEAR_GRADIENT_PATTERN:
                m = a.getParamExpString(this.rh, 0);
                c = this.getParamColour(a, 1);
                e = this.getParamColour(a, 2);
                k = a.getParamExpression(this.rh, 3);
                this.oSurf.createLinearGradientPattern(m, CServices.getColorString(c), CServices.getColorString(e), k);
                break;
            case CRunSurface.ACT_CREATE_RADIAL_GRADIENT_PATTERN:
                m = a.getParamExpString(this.rh, 0);
                c = this.getParamColour(a, 1);
                e = this.getParamColour(a, 2);
                this.oSurf.createRadialGradientPattern(m, CServices.getColorString(c), CServices.getColorString(e));
                break;
            case CRunSurface.ACT_CREATE_COLOR_PATTERN:
                m = a.getParamExpString(this.rh, 0);
                c = this.getParamColour(a, 1);
                this.oSurf.createColorPattern(m, CServices.getColorString(c));
                break;
            case CRunSurface.ACT_CREATE_CALLBACK_PATTERN:
                m = a.getParamExpString(this.rh, 0);
                this.oSurf.createCallbackPattern(m);
                break;
            case CRunSurface.ACT_DRAW_RECTANGLE_WITH_SIZE_AND_PATTERN:
                e = a.getParamExpression(this.rh, 0);
                k = a.getParamExpression(this.rh, 1);
                g = a.getParamExpression(this.rh, 2);
                h = a.getParamExpression(this.rh, 3);
                c = a.getParamExpString(this.rh, 4);
                f = a.getParamExpression(this.rh, 5);
                l = a.getParamExpString(this.rh, 6);
                this.oSurf.drawRect(e, k, g, h, c, f, l);
                break;
            case CRunSurface.ACT_DRAW_RECTANGLE_WITH_FILL_PATTERN:
                e = a.getParamExpression(this.rh, 0);
                k = a.getParamExpression(this.rh, 1);
                g = a.getParamExpression(this.rh, 2);
                h = a.getParamExpression(this.rh, 3);
                c = a.getParamExpString(this.rh, 4);
                f = a.getParamExpression(this.rh, 5);
                l = a.getParamExpString(this.rh, 6);
                e = this.oSurf.getRectByBox(e, k, g, h);
                this.oSurf.drawRect(e.x, e.y, e.w, e.h, c, f, l);
                break;
            case CRunSurface.ACT_DRAW_ELLIPSE_WITH_SIZE_AND_PATTERN:
                e = a.getParamExpression(this.rh, 0);
                k = a.getParamExpression(this.rh, 1);
                g = a.getParamExpression(this.rh, 2);
                h = a.getParamExpression(this.rh, 3);
                c = a.getParamExpString(this.rh, 4);
                f = a.getParamExpression(this.rh, 5);
                l = a.getParamExpString(this.rh, 6);
                e = this.oSurf.getEllipseByRect(e, k, g, h);
                this.oSurf.drawEllipse(e.xCenter, e.yCenter, e.xRadius, e.yRadius, c, f, l);
                break;
            case CRunSurface.ACT_DRAW_ELLIPSE_WITH_PATTERN:
                e = a.getParamExpression(this.rh, 0);
                k = a.getParamExpression(this.rh, 1);
                g = a.getParamExpression(this.rh, 2);
                h = a.getParamExpression(this.rh, 3);
                c = a.getParamExpString(this.rh, 4);
                f = a.getParamExpression(this.rh, 5);
                l = a.getParamExpString(this.rh, 6);
                e = this.oSurf.getRectByBox(e, k, g, h);
                e = this.oSurf.getEllipseByRect(e.x, e.y, e.w, e.h);
                this.oSurf.drawEllipse(e.xCenter, e.yCenter, e.xRadius, e.yRadius, c, f, l);
                break;
            case CRunSurface.ACT_SET_COLOR_OF_PATTERN:
                m = a.getParamExpString(this.rh, 0);
                c = this.getParamColour(a, 1);
                this.oSurf.setColorOfPattern(m, CServices.getColorString(c));
                break;
            case CRunSurface.ACT_SET_COLORS_OF_PATTERN:
                m = a.getParamExpString(this.rh, 0);
                c = this.getParamColour(a, 1);
                e = this.getParamColour(a, 2);
                this.oSurf.setColorOfPattern(m, CServices.getColorString(c), CServices.getColorString(e));
                break;
            case CRunSurface.ACT_SET_VERTICAL_FLAG_OF_PATTERN:
                m = a.getParamExpString(this.rh, 0);
                k = a.getParamExpression(this.rh, 1);
                this.oSurf.setVerticalFlagOfPattern(m, k);
                break;
            case CRunSurface.ACT_SET_ORIGIN_OF_PATTERN:
                this.oSurf.setOriginOfPattern(a.getParamExpString(this.rh, 0), a.getParamExpression(this.rh, 1), a.getParamExpression(this.rh, 2));
                break;
            case CRunSurface.ACT_SET_IMAGE_OF_PATTERN:
                this.oSurf.setImageOfPattern(a.getParamExpString(this.rh, 0), a.getParamExpression(this.rh, 1));
                break;
            case CRunSurface.ACT_DELETE_PATTERN:
                m = a.getParamExpString(this.rh, 0);
                this.oSurf.deletePattern(m);
                break;
            case CRunSurface.ACT_SET_BLIT_REGION_FLAG:
                this.oSurf.setBlitSourceRegionflag(1 == a.getParamExpression(this.rh, 0));
                break;
            case CRunSurface.ACT_SET_BLIT_DESTINATION_POSITION:
                this.oSurf.setBlitDestinationPosition(a.getParamExpression(this.rh, 0), a.getParamExpression(this.rh, 1));
                break;
            case CRunSurface.ACT_SET_BLIT_DESTINATION_DIMENSIONS:
                this.oSurf.setBlitDestinationDimension(a.getParamExpression(this.rh, 0), a.getParamExpression(this.rh, 1));
                break;
            case CRunSurface.ACT_SET_BLIT_SOURCE_POSITION:
                this.oSurf.setBlitSourcePosition(a.getParamExpression(this.rh, 0), a.getParamExpression(this.rh, 1));
                break;
            case CRunSurface.ACT_SET_BLIT_SOURCE_DIMENSIONS:
                this.oSurf.setBlitSourceDimension(a.getParamExpression(this.rh, 0), a.getParamExpression(this.rh, 1));
                break;
            case CRunSurface.ACT_SET_BLIT_STRETCH_MODE:
                this.oSurf.blit.stretchMode = a.getParamExpression(this.rh, 0);
                break;
            case CRunSurface.ACT_BLIT_IMAGE:
                c = a.getParamExpression(this.rh, 0);
                this.oSurf.hasImageIndex(c) && (this.oSurf.loadBankImage(c), this.oSurf.blitImage(c));
                break;
            case CRunSurface.ACT_BLIT_IMAGE_ALPHA_CHANNEL_ONTO_ALPHA_CHANNEL:
                f = a.getParamExpression(this.rh, 0);
                this.oSurf.hasImageIndex(f) && this.oSurf.hasAlpha(f) && this.oSurf.hasAlpha() && (this.oSurf.loadBankImage(c), this.oSurf.execBlit(this.oSurf.imageList[this.oSurf.selectedImage].canvas, this.oSurf.imageList[f].context));
                break;
            case CRunSurface.ACT_BLIT_ONTO_IMAGE:
                c = a.getParamExpression(this.rh, 0);
                this.oSurf.hasImageIndex(c) && (this.oSurf.loadBankImage(c), this.oSurf.blitOntoImage(c, !1));
                break;
            case CRunSurface.ACT_BLIT_ALPHA_CHANNEL_ONTO_IMAGE:
                c = a.getParamExpression(this.rh, 0);
                this.oSurf.hasImageIndex(c) && (this.oSurf.loadBankImage(c), this.oSurf.blitOntoImage(c, !0));
                break;
            case CRunSurface.ACT_BLIT_ALPHA_CHANNEL:
                c = a.getParamExpression(this.rh, 0);
                this.oSurf.hasImageIndex(c) && (this.oSurf.loadBankImage(c), this.oSurf.execBlit(this.oSurf.imageList[this.oSurf.selectedImage].canvas, this.oSurf.imageList[c].context, !0));
                break;
            case CRunSurface.ACT_BLIT_IMAGE_OF_SURFACE:
                k = a.getParamObject(this.rh, 0);
                c = a.getParamExpression(this.rh, 1);
                k = k.ext.oSurf;
                "undefined" != typeof k && k.hasImageIndex(c) && (k.loadBankImage(c), this.oSurf.execBlit(k.imageList[c].canvas, this.oSurf.imageList[this.oSurf.selectedImage].context));
                break;
            case CRunSurface.ACT_BLIT_ONTO_IMAGE_OF_SURFACE:
                k = a.getParamObject(this.rh, 0);
                c = a.getParamExpression(this.rh, 1);
                k = k.ext.oSurf;
                "undefined" != typeof k && k.hasImageIndex(c) && (k.loadBankImage(c), this.oSurf.execBlit(this.oSurf.imageList[this.oSurf.selectedImage].canvas, k.imageList[c].context));
                break;
            case CRunSurface.ACT_SET_BLIT_SEMI_TRANSPARENCY:
            case CRunSurface.ACT_SET_BLIT_ALPHA:
                this.oSurf.blit.alpha = Math.max(0, Math.min(255, a.getParamExpression(this.rh, 0)));
                break;
            case CRunSurface.ACT_SET_BLIT_TRANSPARENCY:
                this.oSurf.blit.useTransparency = 1 == a.getParamExpression(this.rh, 0);
                break;
            case CRunSurface.ACT_SET_BLIT_TINT:
                this.oSurf.blit.tint = this.getParamColour(a, 0);
                break;
            case CRunSurface.ACT_BLIT_ACTIVE_OBJECT:
                k = a.getParamObject(this.rh, 0);
                if (null == k) {
                    break;
                }
                c = k.roc.rcImage;
                this.oSurf.blitImageHandle(c);
                break;
            case CRunSurface.ACT_BLIT_ACTIVE_OBJECT_AT_POSITION:
                k = a.getParamObject(this.rh, 0);
                if (null == k) {
                    break;
                }
                c = k.roc.rcImage;
                this.oSurf.setBlitDestinationPosition(k.hoX - k.hoImgXSpot, k.hoY - k.hoImgYSpot);
                this.oSurf.setBlitSourcePosition(0, 0);
                this.oSurf.setBlitDestinationDimension(k.hoImgWidth, k.hoImgHeight);
                this.oSurf.setBlitSourceDimension(k.hoImgWidth, k.hoImgHeight);
                this.oSurf.blitImageHandle(c);
                break;
            case CRunSurface.ACT_SET_BLIT_SOURCE:
                e = a.getParamExpression(this.rh, 0);
                k = a.getParamExpression(this.rh, 1);
                g = a.getParamExpression(this.rh, 2);
                h = a.getParamExpression(this.rh, 3);
                c = a.getParamExpression(this.rh, 4);
                this.oSurf.setBlitSourcePosition(e, k);
                this.oSurf.setBlitSourceDimension(g, h);
                this.oSurf.setBlitSourceRegionflag(1 == c);
                break;
            case CRunSurface.ACT_SET_BLIT_DESTINATION:
                e = a.getParamExpression(this.rh, 0);
                k = a.getParamExpression(this.rh, 1);
                g = a.getParamExpression(this.rh, 2);
                h = a.getParamExpression(this.rh, 3);
                a.getParamExpression(this.rh, 4);
                this.oSurf.setBlitDestinationPosition(e, k);
                this.oSurf.setBlitDestinationDimension(g, h);
                break;
            case CRunSurface.ACT_SET_BLIT_HOT_SPOT:
                e = a.getParamExpression(this.rh, 0);
                k = a.getParamExpression(this.rh, 1);
                this.oSurf.blit.xHotSpot = e;
                this.oSurf.blit.yHotSpot = k;
                this.oSurf.blit.hotSpotMode &= -3;
                break;
            case CRunSurface.ACT_SET_BLIT_HOT_SPOT_FLAG:
                c = a.getParamExpression(this.rh, 0);
                this.oSurf.blit.useHotSpot |= 0 != c ? 1 : 0;
                break;
            case CRunSurface.ACT_SET_BLIT_HOT_SPOT_PERCENT:
                e = a.getParamExpression(this.rh, 0);
                k = a.getParamExpression(this.rh, 1);
                this.oSurf.blit.xHotSpot = e;
                this.oSurf.blit.yHotSpot = k;
                this.oSurf.blit.hotSpotMode |= 2;
                break;
            case CRunSurface.ACT_SET_BLIT_ANGLE:
                c = a.getParamExpression(this.rh, 0);
                this.oSurf.blit.angle = c % 360;
                break;
            case CRunSurface.ACT_BLIT_INTO_IMAGE:
                c = a.getParamExpression(this.rh, 0);
                this.oSurf.hasImageIndex(c) && (this.oSurf.loadBankImage(c), this.oSurf.execBlit(this.oSurf.imageList[this.oSurf.selectedImage].canvas, this.oSurf.imageList[c].context, !1, this.oSurf.imageList[this.oSurf.selectedImage].hasAlphaChannel && this.oSurf.imageList[c].hasAlphaChannel));
                break;
            case CRunSurface.ACT_PUSH_BLIT_SETTINGS:
                this.oSurf.pushBlitSettings();
                break;
            case CRunSurface.ACT_POP_BLIT_SETTINGS:
                this.oSurf.popBlitSettings();
                break;
            case CRunSurface.ACT_ENABLE_BLIT_ALPHA_TRANSPARENCY:
                this.oSurf.blit.useTransparency = !0;
                break;
            case CRunSurface.ACT_DISABLE_BLIT_ALPHA_TRANSPARENCY:
                this.oSurf.blit.useTransparency = !1;
                break;
            case CRunSurface.ACT_SET_BLIT_EFFECT_BY_INDEX:
                f = a.getParamExpression(this.rh, 0);
                switch (f) {
                    case 0:
                        this.oSurf.setBlitEffect("");
                        break;
                    case 1:
                        this.oSurf.setBlitEffect("semi-transparency");
                        break;
                    case 12:
                        this.oSurf.setBlitEffect("tint");
                        break;
                    case 3:
                        this.oSurf.setBlitEffect("xor");
                        break;
                    case 4:
                        this.oSurf.setBlitEffect("and");
                        break;
                    case 5:
                        this.oSurf.setBlitEffect("or");
                }break;
            case CRunSurface.ACT_SET_BLIT_ALPHA_MODE:
                c = a.getParamExpression(this.rh, 0);
                this.oSurf.blit.alphaComposition = 2 == c;
                break;
            case CRunSurface.ACT_SET_BLIT_EFFECT_BY_NAME:
                m = a.getParamExpString(this.rh, 0);
                this.oSurf.setBlitEffect(m.toLowerCase());
                break;
            case CRunSurface.ACT_ENABLE_BLIT_ALPHA_COMPOSITION:
                this.oSurf.blit.alphaComposition = !0;
                break;
            case CRunSurface.ACT_DISABLE_BLIT_ALPHA_COMPOSITION:
                this.oSurf.blit.alphaComposition = !1;
                break;
            case CRunSurface.ACT_SET_BLIT_CALLBACK_TO:
                this.oSurf.blit.callback = a.getParamExpString(this.rh, 0);
                break;
            case CRunSurface.ACT_ADD_BACKDROP:
                e = a.getParamAltValue(this.rh, 0);
                imgCanvas = this.oSurf.imageList[this.oSurf.selectedImage].canvas;
                k = new CImage;
                c = new Image;
                c.src = imgCanvas.toDataURL();
                k.img = c;
                this.ho.addBackdrop(k, this.oSurf.blit.xDest, this.oSurf.blit.yDest, e, this.ho.hoLayer);
                break;
            case CRunSurface.ACT_BLIT_ONTO_THE_BACKGROUND:
                if (null == this.appContext) {
                    break;
                }
                this.oSurf.execBlit(this.appContext.canvas, this.oSurf.imageList[this.oSurf.selectedImage].context);
                break;
            case CRunSurface.ACT_BLIT_THE_BACKGROUND:
                if (null == this.appContext) {
                    break;
                }
                this.oSurf.execBlit(this.oSurf.imageList[this.oSurf.selectedImage].canvas, this.appContext);
                break;
            case CRunSurface.ACT_ADD_POINT:
                e = a.getParamExpression(this.rh, 0);
                k = a.getParamExpression(this.rh, 1);
                this.oSurf.addPoint(e, k);
                break;
            case CRunSurface.ACT_INSERT_POINT:
                f = a.getParamExpression(this.rh, 0);
                e = a.getParamExpression(this.rh, 1);
                k = a.getParamExpression(this.rh, 2);
                this.oSurf.addPointAt(e, k, f);
                break;
            case CRunSurface.ACT_ADD_POINT_FROM_STRING:
                for (c = a.getParamExpString(this.rh, 0).split(","), e = 0; e < c.length; e += 2) {
                    this.oSurf.addPoint(parseInt(c[e]), parseInt(c[e + 1]));
                }
            case CRunSurface.ACT_LOAD_IMAGE_FROM_FILE:
            case CRunSurface.ACT_LOAD_IMAGE_FROM_FILE_OVERRIDE_EXTENSION:
                c = a.getParamFilename(this.rh, 0);
                this.oSurf.fileIOinProgress = !0;
                this.oSurf.loadFileImage(this.oSurf.selectedImage, c, function () {
                    d.oSurf.fileIOinProgress = !1;
                    d.ho.generateEvent(CRunSurface.CND_ON_LOADING_SUCCEEDED, 0);
                }, function () {
                    d.oSurf.fileIOinProgress = !1;
                    d.ho.generateEvent(CRunSurface.CND_ON_LOADING_FAILED, 0);
                });
                break;
            case CRunSurface.ACT_DRAW_TEXT:
                e = a.getParamExpression(this.rh, 0), k = a.getParamExpression(this.rh, 1), g = a.getParamExpression(this.rh, 2), h = a.getParamExpression(this.rh, 3), f = a.getParamExpString(this.rh, 4), c = this.getParamColour(a, 5), this.oSurf.drawText(e, k, g, h, f, c);
            case CRunSurface.ACT_MOVE_ALL_POINTS_BY_PIXEL:
                e = a.getParamExpression(this.rh, 0);
                k = a.getParamExpression(this.rh, 1);
                this.oSurf.moveAllPoints(e, k);
                break;
            case CRunSurface.ACT_REMOVE_POINT:
                this.oSurf.removePoint(f);
                break;
            case CRunSurface.ACT_REMOVE_ALL_POINTS:
                this.oSurf.deleteAllPoints();
                break;
            case CRunSurface.ACT_ROTATE_ALL_POINTS_ARROUND:
                e = a.getParamExpression(this.rh, 0);
                k = a.getParamExpression(this.rh, 1);
                c = a.getParamExpression(this.rh, 2);
                this.oSurf.rotateAllPointsArround(e, k, c);
                break;
            case CRunSurface.ACT_SCALE_ALL_POINTS:
                e = a.getParamExpression(this.rh, 0);
                k = a.getParamExpression(this.rh, 1);
                c = a.getParamExpression(this.rh, 2);
                f = a.getParamExpression(this.rh, 3);
                this.oSurf.scaleAllPointsArround(e, k, c, f);
                break;
            case CRunSurface.ACT_CREATE_REGULAR_POLYGON:
                c = a.getParamExpression(this.rh, 0);
                e = a.getParamExpression(this.rh, 1);
                this.oSurf.createRegularPolygon(c, e);
                break;
            case CRunSurface.ACT_CREATE_STAR:
                c = a.getParamExpression(this.rh, 0);
                e = a.getParamExpression(this.rh, 1);
                k = a.getParamExpression(this.rh, 2);
                this.oSurf.createStar(c, e, k);
                break;
            case CRunSurface.ACT_DRAW_POLYGON_WITH_COLOR:
                e = a.getParamExpression(this.rh, 0);
                k = a.getParamExpression(this.rh, 1);
                c = this.getParamColour(a, 2);
                this.oSurf.drawPolygon(e, k, CServices.getColorString(c), 0, 0);
                break;
            case CRunSurface.ACT_DRAW_POLYGON:
                e = a.getParamExpression(this.rh, 0);
                k = a.getParamExpression(this.rh, 1);
                c = a.getParamExpression(this.rh, 2);
                f = a.getParamExpression(this.rh, 3);
                l = this.getParamColour(a, 4);
                c = -1 != c ? CServices.getColorString(CServices.swapRGB(c)) : -1;
                this.oSurf.drawPolygon(e, k, c, f, CServices.getColorString(l));
                break;
            case CRunSurface.ACT_DRAW_POLYGON_WITH_PATTERN:
                e = a.getParamExpression(this.rh, 0);
                k = a.getParamExpression(this.rh, 1);
                c = a.getParamExpString(this.rh, 2);
                f = a.getParamExpression(this.rh, 3);
                l = a.getParamExpString(this.rh, 4);
                this.oSurf.drawPolygon(e, k, c, f, l);
                break;
            case CRunSurface.ACT_LOAD_IMAGE_FROM_FILE:
            case CRunSurface.ACT_LOAD_IMAGE_FROM_FILE_OVERRIDE_EXTENSION:
                c = a.getParamFilename(this.rh, 0);
                this.oSurf.fileIOinProgress = !0;
                this.oSurf.loadFileImage(this.oSurf.selectedImage, c, function () {
                    d.oSurf.fileIOinProgress = !1;
                    d.ho.generateEvent(CRunSurface.CND_ON_LOADING_SUCCEEDED, 0);
                }, function () {
                    d.oSurf.fileIOinProgress = !1;
                    d.ho.generateEvent(CRunSurface.CND_ON_LOADING_FAILED, 0);
                });
                break;
            case CRunSurface.ACT_DRAW_TEXT:
                e = a.getParamExpression(this.rh, 0);
                k = a.getParamExpression(this.rh, 1);
                g = a.getParamExpression(this.rh, 2);
                h = a.getParamExpression(this.rh, 3);
                f = a.getParamExpString(this.rh, 4);
                c = this.getParamColour(a, 5);
                this.oSurf.drawText(e, k, g, h, f, c);
                break;
            case CRunSurface.ACT_SET_HORIZONTAL_TEXT_ALIGN:
                c = a.getParamExpression(this.rh, 0);
                this.oSurf.textParams.hAlign = parseInt(c);
                break;
            case CRunSurface.ACT_SET_VERTICAL_TEXT_ALIGN:
                c = a.getParamExpression(this.rh, 0);
                this.oSurf.textParams.vAlign = parseInt(c);
                break;
            case CRunSurface.ACT_SET_TEXT_MULTILINE:
                break;
            case CRunSurface.ACT_SET_TEXT_FONT_FACE:
                c = a.getParamExpString(this.rh, 0);
                this.oSurf.textParams.family = c;
                break;
            case CRunSurface.ACT_SET_TEXT_FONT_SIZE:
                c = a.getParamExpression(this.rh, 0);
                this.oSurf.textParams.size = c + "pt";
                break;
            case CRunSurface.ACT_SET_TEXT_FONT_QUALITY:
                break;
            case CRunSurface.ACT_SET_TEXT_FONT_WEIGHT:
                c = a.getParamExpression(this.rh, 0);
                this.oSurf.textParams.weight = parseInt(c);
                break;
            case CRunSurface.ACT_SET_TEXT_FONT_DECORATION:
                c = a.getParamExpression(this.rh, 0);
                this.oSurf.textParams.decoration = parseInt(c);
                break;
            case CRunSurface.ACT_SET_TEXT_ANGLE:
                c = a.getParamExpression(this.rh, 0);
                this.oSurf.textParams.angle = c % 360;
                break;
            case CRunSurface.ACT_LOOP_THROUNGH_IMAGE_WITH_CALLBACK:
                c = a.getParamExpression(this.rh, 0);
                m = a.getParamExpString(this.rh, 1);
                this.oSurf.loopThroughImageWithCallback(m, c, function () {
                    d.ho.generateEvent(CRunSurface.CND_ON_CALLBACK, m);
                });
                break;
            case CRunSurface.ACT_LOOP_THROUGH_WITH_CALLBACK:
                e = a.getParamExpression(this.rh, 0);
                k = a.getParamExpression(this.rh, 1);
                g = a.getParamExpression(this.rh, 2);
                h = a.getParamExpression(this.rh, 3);
                c = a.getParamExpression(this.rh, 5);
                m = a.getParamExpString(this.rh, 4);
                this.oSurf.loopThroughImageWithCallback(m, c, function () {
                    d.ho.generateEvent(CRunSurface.CND_ON_CALLBACK, m);
                }, e, k, g, h);
                break;
            case CRunSurface.ACT_RETURN_COLOR_TO_CALLBACK:
                c = this.getParamColour(a, 0);
                this.oSurf.setReturnColor(c);
                break;
            case CRunSurface.ACT_RETURN_ALPHA_TO_CALLBACK:
                c = a.getParamExpression(this.rh, 0);
                this.oSurf.setReturnAlpha(c);
                break;
            case CRunSurface.ACT_FLOOD_FILL:
                e = a.getParamExpression(this.rh, 0);
                k = a.getParamExpression(this.rh, 1);
                c = this.getParamColour(a, 2);
                f = a.getParamExpression(this.rh, 3);
                this.oSurf.floodFill(e, k, c, f + 1);
                break;
            case CRunSurface.ACT_APPLY_COLOR_MATRIX:
                c = [[a.getParamExpression(this.rh, 0), a.getParamExpression(this.rh, 1), a.getParamExpression(this.rh, 2)], [a.getParamExpression(this.rh, 3), a.getParamExpression(this.rh, 4), a.getParamExpression(this.rh, 5)], [a.getParamExpression(this.rh, 6), a.getParamExpression(this.rh, 7), a.getParamExpression(this.rh, 8)],];
                this.oSurf.applyColorMatrix(c);
                break;
            case CRunSurface.ACT_APPLY_CONVOLUTION_MATRIX:
                c = [[a.getParamExpression(this.rh, 3), a.getParamExpression(this.rh, 4), a.getParamExpression(this.rh, 5)], [a.getParamExpression(this.rh, 6), a.getParamExpression(this.rh, 7), a.getParamExpression(this.rh, 8)], [a.getParamExpression(this.rh, 9), a.getParamExpression(this.rh, 10), a.getParamExpression(this.rh, 11)],];
                this.oSurf.applyConvolutionMatrix(a.getParamExpression(this.rh, 0), a.getParamExpression(this.rh, 1), a.getParamExpression(this.rh, 2), c);
                break;
            case CRunSurface.ACT_SKYP_REDRAW:
                this.oSurf.skipRedraw = !0;
                break;
            case CRunSurface.ACT_SET_CLIPPING_RECTANGLE:
                this.oSurf.setClippingRect(a.getParamExpression(this.rh, 0), a.getParamExpression(this.rh, 1), a.getParamExpression(this.rh, 2), a.getParamExpression(this.rh, 3));
                break;
            case CRunSurface.ACT_CLEAR_CLIPPING_RECTANGLE:
                this.oSurf.clearClippingRect();
                break;
            case CRunSurface.ACT_MOVE_CHANNELS:
                this.oSurf.moveChannels(a.getParamExpString(this.rh, 0), a.getParamExpString(this.rh, 1), a.getParamExpString(this.rh, 2), a.getParamExpString(this.rh, 3));
                break;
            case CRunSurface.ACT_MINIMIZE:
                this.oSurf.cropImageAuto();
                break;
            case CRunSurface.ACT_SET_LINEAR_RESAMPLING:
                this.oSurf.imageList[this.oSurf.selectedImage].smoothScale = 1 == a.getParamExpression(this.rh, 0);
                break;
            case CRunSurface.ACT_RESIZE_CANVAS:
                this.oSurf.cropImage(a.getParamExpression(this.rh, 0), a.getParamExpression(this.rh, 1), a.getParamExpression(this.rh, 2), a.getParamExpression(this.rh, 3));
                break;
            case CRunSurface.ACT_SAVE_IMAGE_TO_FILE:
                this.oSurf.saveImage(a.getParamFilename(this.rh, 0), a.getParamExpString(this.rh, 1));
                break;
            case CRunSurface.ACT_PERFORM_WITH_CHANNEL:
                this.oSurf.perform(a.getParamExpString(this.rh, 0), a.getParamExpression(this.rh, 1), a.getParamExpString(this.rh, 2));
                break;
            case CRunSurface.ACT_PERFORM_COLOR:
                this.oSurf.performColor(a.getParamExpString(this.rh, 0), this.getParamColour(a, 1));
                break;
            default:
                console.log("ACTION: " + b + " NOT IMPLEMENTED");
        }
    }, expression: function (b) {
        switch (b) {
            case CRunSurface.EXP_IMAGE_COUNT:
                return this.oSurf.nImages;
            case CRunSurface.EXP_SEL_IMAGE:
                return this.oSurf.selectedImage;
            case CRunSurface.EXP_DISPLAY_IMAGE:
                return this.oSurf.currentImage;
            case CRunSurface.EXP_RGB_AT:
                b = this.ho.getExpParam();
                var a = this.ho.getExpParam();
                return this.oSurf.getRGBAt(this.oSurf.selectedImage, b, a);
            case CRunSurface.EXP_WIDTH:
                return this.oSurf.getWidth(this.oSurf.selectedImage);
            case CRunSurface.EXP_HEIGHT:
                return this.oSurf.getHeight(this.oSurf.selectedImage);
            case CRunSurface.EXP_DISPLAY_WIDTH:
                return this.oSurf.getWidth(this.oSurf.currentImage);
            case CRunSurface.EXP_DISPLAY_HEIGHT:
                return this.oSurf.getHeight(this.oSurf.currentImage);
            case CRunSurface.EXP_IMG_WIDTH:
                var d = this.ho.getExpParam();
                return this.oSurf.getWidth(d);
            case CRunSurface.EXP_IMG_HEIGHT:
                return d = this.ho.getExpParam(), this.oSurf.getHeight(d);
            case CRunSurface.EXP_IMG_RGB_AT:
                return d = this.ho.getExpParam(), b = this.ho.getExpParam(), a = this.ho.getExpParam(), this.oSurf.getRGBAt(d, b, a);
            case CRunSurface.EXP_PATTERN:
                return d = this.ho.getExpParam(), (b = this.oSurf.getPattern(d)) ? b.name : "";
            case CRunSurface.EXP_PATTERN_COUNT:
                return Object.keys(this.oSurf.patterns).length;
            case CRunSurface.EXP_PATTERN_COLOR:
                return b = this.ho.getExpParam(), (b = this.oSurf.getPattern(b)) ? b.color : 0;
            case CRunSurface.EXP_PATTERN_COLOR_A:
                return b = this.ho.getExpParam(), (b = this.oSurf.getPattern(b)) ? b.colorA : 0;
            case CRunSurface.EXP_PATTERN_COLOR_B:
                return b = this.ho.getExpParam(), (b = this.oSurf.getPattern(b)) ? b.colorB : 0;
            case CRunSurface.EXP_PATTERN_IMAGE:
                return b = this.ho.getExpParam(), (b = this.oSurf.getPattern(b)) ? b.tiledImage : 0;
            case CRunSurface.EXP_RED_AT:
                return b = this.ho.getExpParam(), a = this.ho.getExpParam(), this.oSurf.getRed(this.TargetImage.selectedImage, b, a);
            case CRunSurface.EXP_GREEN_AT:
                return b = this.ho.getExpParam(), a = this.ho.getExpParam(), this.oSurf.getGreen(this.TargetImage.selectedImage, b, a);
            case CRunSurface.EXP_BLUE_AT:
                return b = this.ho.getExpParam(), a = this.ho.getExpParam(), this.oSurf.getBlue(this.TargetImage.selectedImage, b, a);
            case CRunSurface.EXP_ALPHA_AT:
                return b = this.ho.getExpParam(), a = this.ho.getExpParam(), this.oSurf.getAlpha(this.TargetImage.selectedImage, b, a);
            case CRunSurface.EXP_IMG_RED_AT:
                return d = this.ho.getExpParam(), b = this.ho.getExpParam(), a = this.ho.getExpParam(), this.oSurf.getRed(d, b, a);
            case CRunSurface.EXP_IMG_GREEN_AT:
                return d = this.ho.getExpParam(), b = this.ho.getExpParam(), a = this.ho.getExpParam(), this.oSurf.getGreen(d, b, a);
            case CRunSurface.EXP_IMG_BLUE_AT:
                return d = this.ho.getExpParam(), b = this.ho.getExpParam(), a = this.ho.getExpParam(), this.oSurf.getBlue(d, b, a);
            case CRunSurface.EXP_IMG_ALPHA_AT:
                return d = this.ho.getExpParam(), b = this.ho.getExpParam(), a = this.ho.getExpParam(), this.oSurf.getAlpha(d, b, a);
            case CRunSurface.EXP_INVERT:
                return b = this.ho.getExpParam(), this.oSurf.getInvertColor(b);
            case CRunSurface.EXP_TRANSP_COLOR:
                return this.oSurf.imageList[this.oSurf.selectedImage].transparentColor;
            case CRunSurface.EXP_IMG_TRANSP_COLOR:
                d = this.ho.getExpParam();
                if (this.oSurf.hasImageIndex(d)) {
                    return this.oSurf.imageList[d].transparentColor;
                }
                break;
            case CRunSurface.EXP_CALLBACK_X:
                return this.oSurf.callback.xPos;
            case CRunSurface.EXP_CALLBACK_Y:
                return this.oSurf.callback.yPos;
            case CRunSurface.EXP_CALLBACK_AREA_X1:
                break;
            case CRunSurface.EXP_CALLBACK_AREA_Y1:
                break;
            case CRunSurface.EXP_CALLBACK_AREA_X2:
                break;
            case CRunSurface.EXP_CALLBACK_AREA_Y2:
                break;
            case CRunSurface.EXP_CALLBACK_SRC_COL:
                return this.oSurf.callback.colSrc;
            case CRunSurface.EXP_CALLBACK_DEST_COL:
                return this.oSurf.callback.colDest;
            case CRunSurface.EXP_CALLBACK_SRC_ALPHA:
                return this.oSurf.callback.alphaSrc;
            case CRunSurface.EXP_CALLBACK_DEST_ALPHA:
                return this.oSurf.callback.alphaDest;
            case CRunSurface.EXP_LAST_IMAGE:
                return this.TargetImage.imageList.length - 1;
            case CRunSurface.EXP_IMG_HOT_X:
                d = this.ho.getExpParam();
                if (this.oSurf.hasImageIndex(d)) {
                    return this.oSurf.imageList[d].hotSpot.x;
                }
                break;
            case CRunSurface.EXP_IMG_HOT_Y:
                d = this.ho.getExpParam();
                if (this.oSurf.hasImageIndex(d)) {
                    return this.oSurf.imageList[d].hotSpot.y;
                }
                break;
            case CRunSurface.EXP_HOT_X:
                return this.oSurf.imageList[this.oSurf.selectedImage].hotSpot.x;
            case CRunSurface.EXP_HOT_Y:
                return this.oSurf.imageList[this.oSurf.selectedImage].hotSpot.y;
            case CRunSurface.EXP_X_SCALE:
                return this.oSurf.imageList[this.oSurf.selectedImage].xScale;
            case CRunSurface.EXP_Y_SCALE:
                return this.oSurf.imageList[this.oSurf.selectedImage].yScale;
            case CRunSurface.EXP_RANDOM_COLOR:
                var c = Math.floor(256 * Math.random()), f = Math.floor(256 * Math.random());
                b = Math.floor(256 * Math.random());
                return CServices.swapRGB(c << 16 | f << 8 | b);
            case CRunSurface.EXP_MULTIPLY:
                return b = this.ho.getExpParam(), a = this.ho.getExpParam(), this.oSurf.multiplyColors(b, a);
            case CRunSurface.EXP_COMPOSED_COLOR:
                var g = this.ho.getExpParam();
                d = this.ho.getExpParam();
                a = this.ho.getExpParam();
                b = this.ho.getExpParam();
                c = CServices.getRValueFlash(g);
                f = CServices.getGValueFlash(g);
                g = CServices.getBValueFlash(g);
                var h = CServices.getRValueFlash(a), e = CServices.getGValueFlash(a);
                a = CServices.getBValueFlash(a);
                var k = d + b * (1 - d);
                c = Math.max(0, Math.min(255, (c * d + h * b * (1 - d)) / k));
                f = Math.max(0, Math.min(255, (f * d + e * b * (1 - d)) / k));
                b = Math.max(0, Math.min(255, (g * d + a * b * (1 - d)) / k));
                return CServices.swapRGB(c << 16 | f << 8 | b);
            case CRunSurface.EXP_COMPOSED_ALPHA:
                return b = this.ho.getExpParam(), a = this.ho.getExpParam(), Math.max(0, Math.min(255, b + a * (1 - b)));
            case CRunSurface.EXP_ADD:
                return b = this.ho.getExpParam(), a = this.ho.getExpParam(), this.oSurf.addColors(b, a);
            case CRunSurface.EXP_SUBSTRACT:
                return b = this.ho.getExpParam(), a = this.ho.getExpParam(), this.oSurf.substractColors(b, a);
            case CRunSurface.EXP_RGB:
                return c = this.ho.getExpParam(), f = this.ho.getExpParam(), b = this.ho.getExpParam(), CServices.swapRGB(c << 16 | f << 8 | b);
            case CRunSurface.EXP_HEX_TO_RGB:
                return b = this.ho.getExpParam(), b = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(b), CServices.swapRGB(parseInt(b[1], 16) << 16 | parseInt(b[2], 16) << 8 | parseInt(b[3], 16));
            case CRunSurface.EXP_FLOOD_X1:
                return this.oSurf.floodArea.x1;
            case CRunSurface.EXP_FLOOD_Y1:
                return this.oSurf.floodArea.x1;
            case CRunSurface.EXP_FLOOD_X2:
                return this.oSurf.floodArea.x2;
            case CRunSurface.EXP_FLOOD_Y2:
                return this.oSurf.floodArea.y2;
            case CRunSurface.EXP_ANGLE:
                return this.oSurf.imageList[this.oSurf.selectedImage].rotation;
            case CRunSurface.EXP_BLEND:
                return g = this.ho.getExpParam(), a = this.ho.getExpParam(), d = this.ho.getExpParam(), f = CServices.getRValueFlash(g), c = CServices.getGValueFlash(g), b = CServices.getBValueFlash(g), g = CServices.getRValueFlash(a), e = CServices.getGValueFlash(a), a = CServices.getBValueFlash(a), CServices.swapRGB(f + (g - f) * d << 16 | c + (e - c) * d << 8 | b + (a - b) * d);
            case CRunSurface.EXP_SCREEN_TO_IMG_X:
                this.ho.getExpParam();
                this.ho.getExpParam();
                break;
            case CRunSurface.EXP_SCREEN_TO_IMG_Y:
                this.ho.getExpParam();
                this.ho.getExpParam();
                break;
            case CRunSurface.EXP_FILTER_EXT_COUNT:
                break;
            default:
                console.log("EXPRESSION " + b + " NOT IMPLEMENTED");
        }
        return 0;
    }
});