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
    this.hasAlphaChannel = false;
    this.transparentColor = CServices.swapRGB((0 << 16) | (0 << 8) | 0);
    this.useTransparentColor = true;
    this.isInitImage = false;
    this.imageHandle = 0;
    this.rotation = 0;
    this.xScale = 1;
    this.yScale = 1;
    this.smoothScale = false;
    this.hotSpot = {
        x: 0,
        y: 0
    };
    this.updateTransparent = false;
    this.fileLoaded = false;
}

OSurfaceImage.prototype = {
    getWidth() {
        return this.canvas.width;
    },

    getHeight() {
        return this.canvas.height;
    },

    drawTransparentColor(x, y, w, h) {
        if (!this.useTransparentColor || !this.updateTransparent) {
            return;
        }

        var pixels = this.context.getImageData(x, y, w, h);
        var pixelData = pixels.data;
        for (var i = 0; i < w * h; i++) {
            if (CServices.swapRGB((pixelData[i * 4] << 16) | (pixelData[i * 4 + 1] << 8) | pixelData[i * 4 + 2]) == this.transparentColor) {
                pixelData[i * 4 + 3] = 0;
            }
        }
        pixels.data = pixelData;
        this.context.putImageData(pixels, x, y);
        this.updateTransparent = false;
    },

    setAlphaAt(x, y, value) {
        x = Math.max(0, Math.min(x, this.getWidth()));
        y = Math.max(0, Math.min(y, this.getHeight()));
        value = Math.max(0, Math.min(value, 255));

        var pixel = this.context.getImageData(x, y, 1, 1);
        pixel.data[3] = value;
        this.context.putImageData(pixel, x, y);

        if (value != 255 && !this.hasAlphaChannel) { this.hasAlphaChannel = true; }
    },

    deleteAlphaChannel() {
        this.hasAlphaChannel = false;
        var imageData = this.context.getImageData(0, 0, this.getWidth(), this.getHeight());
        var pixelData = imageData.data;
        for (var i = 0; i < pixelData.length; i += 4) {
            pixelData[i + 3] = 255;
        }
        imageData.data = pixelData;
        this.context.putImageData(imageData, 0, 0);
    }
};

function OSurfacePattern() {
    this.name;
    this.type = "";
    this.tiledImage = -1;
    this.tiledImageOffsetX = 0;
    this.tiledImageOffsetY = 0;
    this.colorA = 0;
    this.colorB = 0;
    this.color = 0;
    this.vertical = false;
    this.callbackContext = null;
};

OSurfacePattern.TYPE_TILED_IMAGE = "tiled_image";
OSurfacePattern.TYPE_LINEAR_GRADIENT = "linear_gradient";
OSurfacePattern.TYPE_RADIAL_GRADIENT = "radial_gradient";
OSurfacePattern.TYPE_COLOR = "color";
OSurfacePattern.TYPE_CALLBACK = "callback";

function OSurface() {
    this.x = 0;
    this.y = 0;
    this.w = 0;
    this.h = 0;
    this.w_def = 0;
    this.h_def = 0;
    this.storedAlpha = []; // To store alpha and restore after drawing
    this.context = null;
    this.globalContext = null;
    this.extensionObject = null;
    this.useAbsoluteCoordinates = false;
    this.antiAliasing = false;
    this.skipRedraw = false;
    this.blit = {
        xDest: 0,
        yDest: 0,
        wDest: null,
        hDest: null,
        xSource: 0,
        ySource: 0,
        wSource: null,
        hSource: null,
        image: 0,
        alphaComposition: false,
        regionflag: 0,
        stretchMode: 0,
        xHotSpot: 0,
        yHotSpot: 0,
        hotSpotMode: 0,
        angle: 0,
        useTransparency: true,
        effect: null,
        callback: "",
        alpha: 255,
        tin: 0,
    };
    this.savedBlit = null;
    this.nImages = 0;
    this.imageList = [];
    this.currentImage = -1;
    this.selectedImage = -1;
    this.MAX_IMAGES = 16;
    this.patterns = [];
    this.points = [];

    this.threadedIO = false;
    this.keepPoints = false;
    this.multiImg = false;
    this.dispTarget = false;
    this.selectLast = false;

    this.textParams = {
        size: "13pt",
        family: "Arial",
        style: "",
        weight: 5,
        decoration: 0,
        vAlign: 0,
        hAlign: 0,
        angle: 0,
    };

    this.callback = {
        xPos: 0,
        yPos: 0,
        colorReturn: false,
        colNew: 0,
        colDest: 0,
        colSrc: 0,
        alphaReturn: false,
        alphaSrc: 255,
        alphaDest: 255,
    };

    this.floodArea = {
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 0
    };

    this.storedImage = document.createElement("canvas").getContext("2d");
}

OSurface.BLIT_EFFECT_AND = 'and';
OSurface.BLIT_EFFECT_OR = 'or';
OSurface.BLIT_EFFECT_XOR = 'xor';
OSurface.BLIT_EFFECT_SEMI_TRANSPARENCY = "semi-transparency";
OSurface.BLIT_EFFECT_TINT = "tint";

OSurface.prototype = {

    getXCoord() { return this.useAbsoluteCoordinates ? -this.x : 0; },

    getYCoord() { return this.useAbsoluteCoordinates ? -this.y : 0; },

    redraw() { this.redrawPart(0, 0, this.w, this.h); },

    redrawPart(x, y, w, h) {
        if (w == 0 || h == 0 || this.skipRedraw) { return; }
        if (this.currentImage != this.selectedImage) return;

        var context = this.globalContext;
        /*var bufferContext = document.createElement("canvas").getContext("2d");
        this.context = bufferContext;*/
        context.clearRect(x, y, w, h);
        if (!this.hasImageIndex(this.currentImage)) { return; }
        context.canvas.width = this.imageList[this.currentImage].getWidth();
        context.canvas.height = this.imageList[this.currentImage].getHeight();
        this.w = this.imageList[this.currentImage].getWidth();
        this.h = this.imageList[this.currentImage].getHeight();
        //this.redrawTransparentColor(x, y, w, h);

        context.drawImage(this.imageList[this.currentImage].canvas, x, y, w, h);

        // Update bank image for collision
        /********************************************************************************
            WORKAROUND : NOT RECOMMANDED BY YVES
        *********************************************************************************/
        /*var newImage = new CImage();
        newImage.width = context.canvas.width;
        newImage.height = context.canvas.height;   
        var img = new Image();
        img.src = context.canvas.toDataURL();
        newImage.img = img;
        newImage.app = this.extensionObject.rh.rhApp;

        img.onload = () => {
            this.extensionObject.rh.rhApp.imageBank.delImage(this.imageList[this.currentImage].imageHandle);
            this.imageList[this.currentImage].imageHandle = this.extensionObject.rh.rhApp.imageBank.addImage(newImage);
            this.extensionObject.ho.roc.rcImage = this.imageList[this.currentImage].imageHandle;
            /*this.extensionObject.rh.rhApp.imageBank.getImageFromHandle(this.imageList[this.currentImage].imageHandle).img = img;
            this.extensionObject.rh.rhApp.imageBank.setToLoad(this.imageList[this.currentImage].imageHandle);
            this.extensionObject.ho.roc.rcImage = this.imageList[this.currentImage].imageHandle;*/
        /*};*/

    },

    redrawTransparentColor(x, y, w, h) {
        this.imageList[this.currentImage].drawTransparentColor(x, y, w, h);
    },

    setCurrentImage(index) {
        if (index < 0) { index = 0; }

        if (index > this.nImages) { index = this.nImages; }

        if (!this.hasImageIndex(index)) return;

        this.currentImage = index;
        if (this.currentImage >= 0) {
            this.context = this.imageList[this.currentImage].context;
        }

        this.w = this.imageList[this.currentImage].getWidth();
        this.h = this.imageList[this.currentImage].getHeight();
        this.imageList[this.currentImage].updateTransparent = true;

        this.redraw();
    },

    setSelectedImage(index) {
        if (index < 0) index = 0;

        if (index > this.nImages) index = this.nImages;

        if (!this.hasImageIndex(index)) return;

        this.selectedImage = index;

        if (this.selectedImage >= 0) this.loadBankImage(this.selectedImage);

        this.context = this.imageList[this.selectedImage].context;

        if (this.dispTarget) {
            this.currentImage = this.selectedImage;
            this.redraw();
        }
    },

    deleteImage(index) {
        if (!this.hasImageIndex(index)) return;

        this.imageList.splice(index, 1);
        this.nImages = this.imageList.length;

        if (this.selectedImage == index || this.selectedImage == this.nImages) {
            if (this.selectedImage > 0) {
                this.selectedImage--;
            } else {
                this.selectedImage = -1;
            }
        }

        if (this.currentImage == index || this.currentImage == this.nImages) {
            if (this.currentImage > 0) {
                this.currentImage--;
            } else {
                this.currentImage = -1;
            }

            this.redraw();
        }
    },

    deleteAllImages() {
        this.currentImage = -1;
        this.selectedImage = -1;
        this.imageList.splice(0, this.imageList.length);

        this.redraw();
    },

    insertImageAt(index, w, h) {

        var newImage = new OSurfaceImage();
        newImage.canvas.width = w;
        newImage.canvas.height = h;
        this.imageList.splice(index, 0, newImage);
        if (this.selectLast) {
            this.selectedImage = index;

            this.redraw();
        }
    },

    copyImage(destinationIndex, sourceImage) {
        if (!this.hasImageIndex(destinationIndex) || !this.hasImageIndex(sourceImage)) return;

        this.loadBankImage(sourceImage);
        this.imageList[destinationIndex].context.clearRect(0, 0, this.imageList[destinationIndex].getWidth(), this.imageList[destinationIndex].getHeight());
        this.imageList[destinationIndex].context.drawImage(this.imageList[sourceImage].canvas, 0, 0, this.imageList[sourceImage].getWidth(), this.imageList[sourceImage].getHeight());
        this.imageList[destinationIndex].useTransparentColor = false;
        if (destinationIndex == this.currentImage) this.redraw();
    },

    copyImageFromCanvas(destinationIndex, canvas) {
        if (!this.hasImageIndex(destinationIndex)) return;

        this.imageList[destinationIndex].context.clearRect(0, 0, this.imageList[destinationIndex].getWidth(), this.imageList[destinationIndex].getHeight());
        this.imageList[destinationIndex].context.drawImage(canvas, 0, 0, canvas.width, canvas.height);
        this.imageList[destinationIndex].useTransparentColor = false;
        if (destinationIndex == this.currentImage) this.redraw();
    },

    quickStoreImage() {
        this.storedImage.clearRect(0, 0, this.storedImage.canvas.width, this.storedImage.canvas.height);
        this.storedImage.canvas.width = this.imageList[this.selectedImage].getWidth();
        this.storedImage.canvas.height = this.imageList[this.selectedImage].getHeight();
        this.storedImage.drawImage(this.imageList[this.selectedImage].canvas, 0, 0);
    },

    quickRestoreImage() {
        this.imageList[this.selectedImage].context.drawImage(this.storedImage.canvas, 0, 0);
    },

    setHotSpotX(x) {
        this.imageList[this.selectedImage].hotSpot.x = Math.max(0, x);
    },

    setHotSpotY(y) {
        this.imageList[this.selectedImage].hotSpot.y = Math.max(0, y);
    },

    loadBankImage(index) {
        if (!this.hasImageIndex(index)) return;

        if (!this.imageList[index].isInitImage) {
            var image = this.extensionObject.rh.rhApp.imageBank.getImageFromHandle(this.imageList[index].imageHandle);
            if (image != null) {
                if (image.mosaic == 0 && image.img != null) {
                    this.imageList[index].canvas.width = image.width;
                    this.imageList[index].canvas.height = image.height;
                    this.imageList[index].context.drawImage(image.img, 0, 0);
                } else {
                    this.imageList[index].canvas.width = image.width;
                    this.imageList[index].canvas.height = image.height;
                    this.imageList[index].context.drawImage(image.app.imageBank.mosaics[image.mosaic],
                        image.mosaicX, image.mosaicY,
                        image.width, image.height,
                        0, 0,
                        image.width, image.height
                    );
                }
                this.imageList[index].hotSpot.x = image.xSpot;
                this.imageList[index].hotSpot.y = image.ySpot;
                this.imageList[index].hasAlphaChannel = this.imageHasAlpha(this.imageList[index].context);
            } else {
                this.imageList[index].canvas.width = this.w_def;
                this.imageList[index].canvas.height = this.h_def;
            }

            this.imageList[index].isInitImage = true;
        }
    },

    imageHasAlpha(context) {
        var data = context.getImageData(0, 0, context.canvas.width, context.canvas.height).data,
            hasAlphaPixels = false;
        for (var i = 3, n = data.length; i < n; i += 4) {
            if (data[i] < 255) {
                hasAlphaPixels = true;
                break;
            }
        }
        return hasAlphaPixels;
    },

    setTransparentColor(index, color, replace) {
        if (!this.hasImageIndex(index)) return;

        var oldColor = this.imageList[index].transparentColor;
        this.imageList[index].transparentColor = color;

        if (replace) {
            this.replaceColor(index, oldColor, color);
        } else if (this.currentImage == index) {
            this.redraw();
        }
    },

    replaceColor(index, oldColor, newColor) {
        if (!this.hasImageIndex(index)) return;

        var oldRed = (oldColor >>> 16) & 0xFF,
            oldGreen = (oldColor >>> 8) & 0xFF,
            oldBlue = oldColor & 0xFF
        newRed = (newColor >>> 16) & 0xFF,
            newGreen = (newColor >>> 8) & 0xFF,
            newBlue = newColor & 0xFF;

        var imageData = this.imageList[index].context.getImageData(0, 0, this.imageList[index].getWidth(), this.imageList[index].getHeight());
        for (var i = 0; i < imageData.data.length; i += 4) {
            if (imageData.data[i] == oldRed &&
                imageData.data[i + 1] == oldGreen &&
                imageData.data[i + 2] == oldBlue
            ) {
                // change to your new rgb
                imageData.data[i] = newRed;
                imageData.data[i + 1] = newGreen;
                imageData.data[i + 2] = newBlue;
            }
        }

        this.imageList[index].context.putImageData(imageData, 0, 0);
        this.updateTransparent = (newColor == this.imageList[index].transparentColor);
        if (this.currentImage == index) {
            this.redraw();
        }
    },

    getTransparentColor(index) {
        if (!this.hasImageIndex(index)) {
            return 0;
        }

        return this.imageList[index].transparentColor;
    },

    setTransparent(trans) {
        for (var i = 0; i < this.imageList.length; i++) {
            this.imageList[i].useTransparentColor = trans;
        }
    },

    loadFileImage: function (index, url, callback, failCallback) {
        this.imageList[this.selectedImage].fileLoaded = false;
        if (!this.hasImageIndex(index)) return;
        var img = new Image;
        img.src = url;
        img.onload = () => {
            this.imageList[index].context.drawImage(img, 0, 0);
            this.redrawPart(0, 0, img.width, img.height);
            this.imageList[this.selectedImage].fileLoaded = true;
            callback();
        };
        img.onerror = () => {
            failCallback();
        };
    },

    hasAlpha(index) {
        if (typeof index == "undefined") index = this.selectedImage;
        return typeof (this.imageList[index]) != "undefined" && this.imageList[index].hasAlphaChannel;
    },

    storeAlpha() {
        if (this.hasAlpha() && this.hasImageIndex(this.selectedImage)) {

            this.imageList[this.selectedImage].context["globalCompositeOperation"] = "source-atop";
        }
    },

    restoreAlpha() {
        if (this.hasAlpha() && this.hasImageIndex(this.selectedImage) && this.storedAlpha.length > 0) {
            this.imageList[this.selectedImage].context["globalCompositeOperation"] = "source-over";
        }
    },

    setAlpha(image, x, y, value) {
        if (typeof (this.imageList[image]) != "undefined") {
            this.imageList[image].setAlphaAt(x, y, value);
        }
    },

    setClippingRect(x, y, w, h) {
        var ctx = this.imageList[this.selectedImage].context;
        ctx.rect(x, y, w, h);
        ctx.clip();
    },

    clearClippingRect() {
        var ctx = this.imageList[this.selectedImage].context;
        ctx.rect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.clip();
    },

    flipVerticaly() {
        var context = this.imageList[this.selectedImage].context;
        var tempContext = document.createElement("canvas").getContext("2d");
        tempContext.canvas.width = context.canvas.width;
        tempContext.canvas.height = context.canvas.height;
        tempContext.drawImage(context.canvas, 0, 0);
        context.clearRect(0, 0, context.canvas.width, context.canvas.height);

        for (var y = 0; y < context.canvas.height; y++)
            context.drawImage(tempContext.canvas, 0, y, context.canvas.width, 1, 0, context.canvas.height - y - 1, context.canvas.width, 1);

        this.redraw();
    },

    flipHorizontaly(context) {
        var context = this.imageList[this.selectedImage].context;
        var tempContext = document.createElement("canvas").getContext("2d");
        tempContext.canvas.width = context.canvas.width;
        tempContext.canvas.height = context.canvas.height;
        tempContext.drawImage(context.canvas, 0, 0);
        context.clearRect(0, 0, context.canvas.width, context.canvas.height);
        for (var x = 0; x < context.canvas.width; x++)
            context.drawImage(tempContext.canvas, x, 0, 1, context.canvas.height, context.canvas.width - x - 1, 0, 1, context.canvas.height);

        this.redraw();
    },

    scroll(x, y, wrap) {
        var ctx = this.imageList[this.selectedImage].context;
        var tempContext = document.createElement("canvas").getContext("2d");
        var w = ctx.canvas.width,
            h = ctx.canvas.height;
        tempContext.canvas.width = w;
        tempContext.canvas.height = h;
        x %= w;
        y %= h;
        tempContext.drawImage(ctx.canvas, 0, 0);
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(tempContext.canvas, 0, 0, w - x, h - y, x, y, w - x, h - y);
        if (wrap) {
            if (x > 0)
                ctx.drawImage(tempContext.canvas, x - w, y);
            if (x > 0 && y > 0)
                ctx.drawImage(tempContext.canvas, x - w, y - h);
            if (y > 0)
                ctx.drawImage(tempContext.canvas, x, y - h);
            if (x < 0 && y > 0)
                ctx.drawImage(tempContext.canvas, x + w, y - h);
            if (x < 0)
                ctx.drawImage(tempContext.canvas, x + w, y);
            if (x < 0 && y < 0)
                ctx.drawImage(tempContext.canvas, x + w, y + h);
            if (y < 0)
                ctx.drawImage(tempContext.canvas, x, y + h);
            if (x > 0 && y < 0)
                ctx.drawImage(tempContext.canvas, x - w, y + h);
        }
        this.redraw();
    },

    getRectByBox(x1, y1, x2, y2) {

        var w = Math.abs(x2 - x1);
        var h = Math.abs(y2 - y1);

        return {
            x: x1 > x2 ? x2 : x1,
            y: y1 > y2 ? y2 : y1,
            w: w,
            h: h,
        }
    },

    getEllipseByRect(x, y, w, h) {
        return {
            xCenter: x + (w / 2),
            yCenter: y + (h / 2),
            xRadius: (w / 2),
            yRadius: (h / 2),
        }
    },

    getWidth(index) {
        if (!this.hasImageIndex(index)) {
            return 0;
        }
        if (!this.imageList[index].fileLoaded) this.loadBankImage(index);
        return this.imageList[index].getWidth();
    },

    getHeight(index) {
        if (!this.hasImageIndex(index)) {
            return 0;
        }

        if (!this.imageList[index].fileLoaded) this.loadBankImage(index);

        return this.imageList[index].getHeight();
    },

    setW(w) {
        this.w = w;
    },

    setH(h) {
        this.h = h;
    },

    resizeImage(w, h) {
        w = w < 0 ? 0 : w;
        h = h < 0 ? 0 : h;
        var tempCtx = document.createElement('canvas').getContext("2d");
        tempCtx.drawImage(this.imageList[this.selectedImage].canvas, 0, 0, w, h);
        this.imageList[this.selectedImage].canvas.width = w;
        this.imageList[this.selectedImage].canvas.height = h;
        this.imageList[this.selectedImage].context.drawImage(tempCtx.canvas, 0, 0)

        this.redraw();
    },

    rotateImage(degrees) {
        var rads = degrees * Math.PI / 180;
        var img = this.imageList[this.selectedImage];
        var w = img.getWidth();
        var h = img.getHeight();
        var tempCtx = document.createElement('canvas').getContext("2d");
        var c = Math.cos(rads);
        var s = Math.sin(rads);
        if (s < 0) {
            s = -s;
        }
        if (c < 0) {
            c = -c;
        }
        var newWidth = h * s + w * c;
        var newHeight = h * c + w * s;


        tempCtx.canvas.width = 5000;
        tempCtx.canvas.height = 5000;

        tempCtx.save();
        tempCtx.translate(w, 0);
        tempCtx.rotate(-rads);
        tempCtx.drawImage(img.canvas, 0, 0);
        tempCtx.restore();

        img.context.clearRect(0, 0, img.canvas.width, img.canvas.height);
        //img.canvas.width = newWidth;
        //img.canvas.height = newHeight;
        img.context.drawImage(tempCtx.canvas, -w, 0);

        this.redraw();
    },

    setAngle(degrees) {

        img.rotation = degrees;
        this.redraw();
    },

    setContrast(contrast) {
        var image = this.imageList[this.selectedImage];
        var imageData = image.context.getImageData(0, 0, image.canvas.width, image.canvas.width);
        var data = imageData.data;
        var factor = (259.0 * (contrast + 255.0)) / (255.0 * (259.0 - contrast));
        for (var i = 0; i < data.length; i += 4) {
            data[i] = Math.max(0, Math.min(255, parseInt((data[i] - 128) * contrast + 128)));
            data[i + 1] = Math.max(0, Math.min(255, parseInt((data[i + 1] - 128) * contrast + 128)));
            data[i + 2] = Math.max(0, Math.min(255, parseInt((data[i + 2] - 128) * contrast + 128)));
        }
        image.context.putImageData(imageData, 0, 0);
        this.imageList[this.selectedImage].updateTransparent = true;
        this.redraw();
    },

    getInvertColor(color) {
        var red = (color >>> 16) & 0xFF,
            green = (color >>> 8) & 0xFF,
            blue = color & 0xFF;

        return (blue ^ 255 & 0xFF) << 16 | (green ^ 255 & 0xFF) << 8 | (red ^ 255 & 0xFF);
    },

    multiplyColors(colorA, colorB) {
        var rgb1 = [(colorA >>> 16) & 0xFF, (colorA >>> 8) & 0xFF, colorA & 0xFF];
        var rgb2 = [(colorB >>> 16) & 0xFF, (colorB >>> 8) & 0xFF, colorB & 0xFF];
        var result = [];
        for (var i = 0; i < rgb1.length; i++) {
            result.push(Math.floor(rgb1[i] * rgb2[i] / 255));
        }

        return CServices.swapRGB((result[0] << 16) | (result[1] << 8) | result[2]);
    },

    andColors(colorA, colorB) {
        var rgb1 = [(colorA >>> 16) & 0xFF, (colorA >>> 8) & 0xFF, colorA & 0xFF];
        var rgb2 = [(colorB >>> 16) & 0xFF, (colorB >>> 8) & 0xFF, colorB & 0xFF];
        var result = [];
        for (var i = 0; i < rgb1.length; i++) {
            result.push(rgb1[i] & rgb2[i]);
        }

        return CServices.swapRGB((result[0] << 16) | (result[1] << 8) | result[2]);
    },

    addColors(colorA, colorB) {
        var rgb1 = [(colorA >>> 16) & 0xFF, (colorA >>> 8) & 0xFF, colorA & 0xFF];
        var rgb2 = [(colorB >>> 16) & 0xFF, (colorB >>> 8) & 0xFF, colorB & 0xFF];
        var result = [];
        for (var i = 0; i < rgb1.length; i++) {
            var val = rgb1[i] + rgb2[i];
            if (val > 255) {
                val = 255;
            }
            result.push(val);
        }

        return CServices.swapRGB((result[0] << 16) | (result[1] << 8) | result[2]);
    },

    substractColors(colorA, colorB) {
        var rgb1 = [(colorA >>> 16) & 0xFF, (colorA >>> 8) & 0xFF, colorA & 0xFF];
        var rgb2 = [(colorB >>> 16) & 0xFF, (colorB >>> 8) & 0xFF, colorB & 0xFF];
        var result = [];
        for (var i = 0; i < rgb1.length; i++) {
            var val = rgb1[i] - rgb2[i];
            if (val < 0) {
                val = 0;
            }
            result.push(val);
        }

        return CServices.swapRGB((result[0] << 16) | (result[1] << 8) | result[2]);
    },

    hexToRgb(hex) {
        var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    },

    invertColors() {
        var image = this.imageList[this.selectedImage];
        var imageData = image.context.getImageData(0, 0, image.canvas.width, image.canvas.width);
        var data = imageData.data;
        for (var i = 0; i < data.length; i += 4) {
            data[i] = data[i] ^ 255; // Invert Red
            data[i + 1] = data[i + 1] ^ 255; // Invert Green
            data[i + 2] = data[i + 2] ^ 255; // Invert Blue
        }
        image.context.putImageData(imageData, 0, 0);
        this.imageList[this.selectedImage].updateTransparent = true;
        this.redraw();
    },

    convertToGrayscale() {
        var image = this.imageList[this.selectedImage];
        var imageData = image.context.getImageData(0, 0, image.canvas.width, image.canvas.width);
        var data = imageData.data;
        for (var i = 0; i < data.length; i += 4) {
            var avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
            data[i] = avg;
            data[i + 1] = avg;
            data[i + 2] = avg;
        }
        image.context.putImageData(imageData, 0, 0);

        this.redraw();
    },

    setBrightness(brightness) {
        var image = this.imageList[this.selectedImage];
        var imageData = image.context.getImageData(0, 0, image.canvas.width, image.canvas.width);
        var data = imageData.data;
        brightness *= 100;
        for (var i = 0; i < data.length; i += 4) {
            data[i] += 255 * (brightness / 100);
            data[i + 1] += 255 * (brightness / 100);
            data[i + 2] += 255 * (brightness / 100);
        }
        imageData.data = data;
        image.context.putImageData(imageData, 0, 0);
        this.imageList[this.selectedImage].updateTransparent = true;
        this.redraw();
    },

    drawRect(x, y, w, h, patternName, borderSize, borderPatternName) {
        x += this.getXCoord();
        y += this.getYCoord();
        this.storeAlpha();
        var pattern = this.patterns[patternName];
        var borderPattern = this.patterns[borderPatternName];

        var tempContext = document.createElement("canvas").getContext("2d");
        tempContext.canvas.width = w;
        tempContext.canvas.height = h;

        if ((patternName == CServices.getColorString(this.imageList[this.selectedImage].transparentColor))) {
            tempContext.globalAlpha = 1;
            this.context["globalCompositeOperation"] = "destination-out";
        }

        tempContext.fillStyle = this.hasPattern(patternName) ? this.getStyleByPattern(pattern, tempContext) : patternName;
        tempContext.fillRect(0, 0, w, h);
        tempContext.globalAlpha = 1;
        if (typeof (borderSize) != "undefined" && borderSize > 0) {
            tempContext.strokeStyle = this.hasPattern(borderPatternName) ? this.getStyleByPattern(borderPattern, tempContext) : borderPatternName;
            tempContext.lineWidth = borderSize;
            tempContext.rect(borderSize, borderSize, w - (borderSize * 2), h - (borderSize * 2));
            tempContext.strokeRect(borderSize / 2, borderSize / 2, w - (borderSize), h - (borderSize));
        }

        this.context.drawImage(tempContext.canvas, x, y);
        this.restoreAlpha();
        this.redrawPart(x, y, w, h);
        //this.imageList[this.selectedImage].updateTransparent = (patternName == CServices.getColorString(this.imageList[this.selectedImage].transparentColor) || borderPatternName == CServices.getColorString(this.imageList[this.selectedImage].transparentColor));
        this.context["globalCompositeOperation"] = "source-over"
    },

    drawHardRect(x, y, w, h, color, alpha) {
        var imageData = this.imageList[this.selectedImage].context.getImageData(x, y, w, h);
        var pixelData = imageData.data;
        var colorEl = typeof alpha == "undefined" ? this.hexToRgb(color) : this.hexToRgb('#000000');
        for (var i = 0; i < pixelData.length; i += 4) {
            if (typeof alpha == "undefined") {
                pixelData[i] = colorEl.r;
                pixelData[i + 1] = colorEl.g;
                pixelData[i + 2] = colorEl.b;
                pixelData[i + 3] = 255;

                if (CServices.getColorString(this.imageList[this.selectedImage].transparentColor) == color) {
                    pixelData[i + 3] = 0;
                }
            } else {
                pixelData[i + 3] = alpha;
            }
        }
        imageData.data = pixelData;
        this.imageList[this.selectedImage].context.putImageData(imageData, x, y);
        this.redrawPart(x, y, w, h);
    },

    clearWithColor(color) {
        if (color == CServices.getColorString(this.imageList[this.selectedImage].transparentColor) && this.imageList[this.selectedImage].useTransparentColor) {
            this.imageList[this.selectedImage].context.clearRect(0, 0, this.imageList[this.selectedImage].getWidth(), this.imageList[this.selectedImage].getHeight());
        } else {
            this.drawRect(0, 0, this.imageList[this.selectedImage].getWidth(), this.imageList[this.selectedImage].getHeight(), color);
        }

        this.redraw();
    },

    clearWithAlpha(alpha) {
        this.drawHardRect(0, 0, this.imageList[this.selectedImage].getWidth(), this.imageList[this.selectedImage].getHeight(), null, alpha);
    },

    drawLine(x1, y1, x2, y2, patternName, width) {
        var pattern = this.getPattern(patternName);
        //var tempContext = document.createElement("canvas").getContext("2d");
        //tempContext.canvas.width = x2 - x1;
        //tempContext.canvas.height = y2 - y1;

        // Workarround for 0 size line with width
        if (x1 == x2 && y1 == y2 && width > 0) {
            this.drawEllipse(x1 + width / 2, y1 + width / 2, width / 2, width / 2, patternName);

            return;
        }

        x1 += this.getXCoord();
        x2 += this.getXCoord();
        y1 += this.getYCoord();
        y2 += this.getYCoord();
        this.storeAlpha();

        if ((patternName == CServices.getColorString(this.imageList[this.selectedImage].transparentColor))) {
            this.context.globalAlpha = 1;
            this.context["globalCompositeOperation"] = "destination-out";
        }
        this.context.lineWidth = width;
        this.context.strokeStyle = this.hasPattern(patternName) ? this.getStyleByPattern(pattern, this.context) : patternName;
        this.context.beginPath();
        this.context.moveTo(x1, y1);
        this.context.lineTo(x2, y2);
        this.context.closePath();
        this.context.stroke();
        this.context.lineWidth = 1;

        /*if (!this.hasPattern(patternName)) {
            this.imageList[this.selectedImage].updateTransparent = (patternName == CServices.getColorString(this.imageList[this.selectedImage].transparentColor));
        } else {
            this.imageList[this.selectedImage].updateTransparent = true;
        }*/

        //this.context.drawImage(tempContext.canvas, x1, y1);
        this.context["globalCompositeOperation"] = "source-over";
        this.restoreAlpha();
        this.redraw();
    },

    drawHardLine(x1, y1, x2, y2, color, alpha) {
        var dx = Math.abs(x2 - x1);
        var dy = Math.abs(y2 - y1);
        var d = 2 * dy - dx;
        var y = 0;
        var imageData = this.imageList[this.selectedImage].context.getImageData(x1, y1, dx, dy);
        var pixelData = imageData.data;
        var colorEl = typeof alpha == "undefined" ? this.hexToRgb(color) : this.hexToRgb('#000000');
        for (var x = 0; x < dx; x++) {
            var i = (x + (dx * y)) * 4;

            if (typeof alpha == "undefined") {
                pixelData[i] = colorEl.r;
                pixelData[i + 1] = colorEl.g;
                pixelData[i + 2] = colorEl.b;
                pixelData[i + 3] = 255;

                if (CServices.getColorString(this.imageList[this.selectedImage].transparentColor) == color) {
                    pixelData[i + 3] = 0;
                }
            } else {
                pixelData[i + 3] = alpha;
            }

            if (d > 0) {
                y += 1;
                d = d - 2 * dx;
            }
            d = d + 2 * dy;
        }
        imageData.data = pixelData;
        this.imageList[this.selectedImage].context.putImageData(imageData, x1, y1);
        this.redrawPart(x1, y1, Math.abs(x2 - x1), Math.abs(y2 - y1));
    },

    drawEllipse(xCenter, yCenter, xRadius, yRadius, patternName, borderSize, borderPatternName) {
        if (typeof borderSize == "undefined") borderSize = 0;

        xCenter += this.getXCoord();
        yCenter += this.getYCoord();
        this.storeAlpha();
        var pattern = this.patterns[patternName];

        var tempContext = document.createElement("canvas").getContext("2d");
        if ((patternName == CServices.getColorString(this.imageList[this.selectedImage].transparentColor))) {
            //tempContext.globalAlpha = 1; 
            this.context["globalCompositeOperation"] = "destination-out";
        }
        borderSize *= 0.6; // Fix to display same as windows runtime
        tempContext.canvas.width = xRadius * 2 + (borderSize);
        tempContext.canvas.height = yRadius * 2 + (borderSize);
        tempContext.beginPath();
        tempContext.fillStyle = this.hasPattern(patternName) ? this.getStyleByPattern(pattern, tempContext) : patternName;
        tempContext.lineWidth = borderSize;
        tempContext.ellipse((tempContext.canvas.width / 2), (tempContext.canvas.height / 2), xRadius, yRadius, 0, 0, 2 * Math.PI);
        tempContext.fill();

        if (borderSize > 0) {
            tempContext.strokeStyle = this.hasPattern(borderPatternName) ? this.getStyleByPattern(borderPatternName, tempContext) : borderPatternName;
            tempContext.lineWidth = borderSize;

            tempContext.ellipse(tempContext.canvas.width / 2, tempContext.canvas.height / 2, xRadius - (borderSize / 2), yRadius - (borderSize / 2), 0, 0, 2 * Math.PI);
            tempContext.stroke();
        }

        this.context.drawImage(tempContext.canvas, xCenter - xRadius * 2, yCenter - yRadius * 2);
        //this.imageList[this.selectedImage].updateTransparent = (patternName == CServices.getColorString(this.imageList[this.selectedImage].transparentColor) || borderPatternName == CServices.getColorString(this.imageList[this.selectedImage].transparentColor));
        this.context["globalCompositeOperation"] = "source-over";
        this.restoreAlpha();
        this.redraw();

    },

    drawHardEllipse(xCenter, yCenter, xRadius, yRadius, color) {
        var width = 2 * xRadius,
            height = (2 * yRadius) + 1
            ;
        var colorEl = this.hexToRgb(color);
        var imageData = this.imageList[this.selectedImage].context.getImageData(xCenter - xRadius * 2, yCenter - yRadius * 2, xRadius * 2, yRadius * 2);
        var pixelData = imageData.data;
        var isTransp = this.imageList[this.selectedImage].transparentColor == color && this.imageList[this.selectedImage].useTransparentColor;

        for (var i = 0; i < width; i++) {
            var dx = i - width / 2;
            var x = xRadius + dx;
            var h = Math.round(height * Math.sqrt(width * width / 4.0 - dx * dx) / width);
            var n = 0;
            for (var dy = 1; dy <= h; dy++) {
                n = ((x) + (yRadius + dy) * width) * 4;
                pixelData[n] = colorEl.r;
                pixelData[n + 1] = colorEl.g;
                pixelData[n + 2] = colorEl.b;
                if (isTransp)
                    pixelData[i + 3] = 0;

                n = ((x) + (yRadius - dy) * width) * 4;
                pixelData[n] = colorEl.r;
                pixelData[n + 1] = colorEl.g;
                pixelData[n + 2] = colorEl.b;
                if (isTransp)
                    pixelData[i + 3] = 0;
            }

            if (h >= 0) {
                n = ((x) + (yRadius) * width) * 4;
                pixelData[n] = colorEl.r;
                pixelData[n + 1] = colorEl.g;
                pixelData[n + 2] = colorEl.b;
                if (isTransp)
                    pixelData[i + 3] = 0;
            }
        }

        this.imageList[this.selectedImage].context.putImageData(imageData, xCenter - xRadius * 2, yCenter - yRadius * 2);
        this.redrawPart(xCenter - xRadius, yCenter - yRadius, width, height);

    },

    cropImageAuto() {
        var ctx = this.imageList[this.selectedImage].context;
        var canvas = ctx.canvas,
            w = canvas.width, h = canvas.height,
            pix = { x: [], y: [] },
            imageData = ctx.getImageData(0, 0, canvas.width, canvas.height),
            x, y, index;

        for (y = 0; y < h; y++) {
            for (x = 0; x < w; x++) {
                index = (y * w + x) * 4;
                if (imageData.data[index + 3] > 0) {
                    pix.x.push(x);
                    pix.y.push(y);
                }
            }
        }
        pix.x.sort(function (a, b) { return a - b });
        pix.y.sort(function (a, b) { return a - b });
        var n = pix.x.length - 1;

        w = 1 + pix.x[n] - pix.x[0];
        h = 1 + pix.y[n] - pix.y[0];
        var cut = ctx.getImageData(pix.x[0], pix.y[0], w, h);

        canvas.width = w;
        canvas.height = h;
        ctx.putImageData(cut, 0, 0);
        this.redraw();
    },

    hasImageIndex(index) {
        return typeof this.imageList[index] != "undefined";
    },

    getRGBAt(imageIndex, x, y) {
        if (!this.hasImageIndex(imageIndex)) {
            return 0;
        }
        x = x < 0 ? 0 : x;
        x = x > this.imageList[imageIndex].getWidth() ? this.imageList[imageIndex].getWidth() : x;
        y = y < 0 ? 0 : y;
        y = y > this.imageList[imageIndex].getWidth() ? this.imageList[imageIndex].getWidth() : y;

        var pixel = this.imageList[imageIndex].context.getImageData(x, y, 1, 1);

        return CServices.swapRGB((pixel.data[0] << 16) | (pixel.data[1] << 8) | pixel.data[2]);
    },

    getRed(imageIndex, x, y) {
        if (!this.hasImageIndex(imageIndex)) return 0;

        x = Math.min(0, Math.max(this.imageList[imageIndex].getWidth(), x));
        y = Math.min(0, Math.max(this.imageList[imageIndex].getHeight(), y));
        var pixel = this.imageList[imageIndex].context.getImageData(x, y, 1, 1);

        return pixel.data[0];
    },

    getGreen(imageIndex, x, y) {
        if (!this.hasImageIndex(imageIndex)) return 0;

        x = Math.min(0, Math.max(this.imageList[imageIndex].getWidth(), x));
        y = Math.min(0, Math.max(this.imageList[imageIndex].getHeight(), y));
        var pixel = this.imageList[imageIndex].context.getImageData(x, y, 1, 1);
        return pixel.data[1];
    },

    getBlue(imageIndex, x, y) {
        if (!this.hasImageIndex(imageIndex)) return 0;

        x = Math.min(0, Math.max(this.imageList[imageIndex].getWidth(), x));
        y = Math.min(0, Math.max(this.imageList[imageIndex].getHeight(), y));
        var pixel = this.imageList[imageIndex].context.getImageData(x, y, 1, 1);
        return pixel.data[2];
    },

    getAlpha(imageIndex, x, y) {
        if (!this.hasImageIndex(imageIndex)) return 0;

        x = Math.min(0, Math.max(this.imageList[imageIndex].getWidth(), x));
        y = Math.min(0, Math.max(this.imageList[imageIndex].getHeight(), y));
        var pixel = this.imageList[imageIndex].context.getImageData(x, y, 1, 1);
        return pixel.data[3];
    },

    swapImages(image1, image2) {
        if (image1 < 0 || image1 > this.nImages || image2 < 0 || image2 > this.nImages) {
            return;
        }

        var tempImg = this.imageList[image1];
        this.imageList[image1] = this.imageList[image2];
        this.imageList[image2] = tempImg;
    },

    deleteAlphaChannel() {
        this.imageList[this.selectedImage].deleteAlphaChannel();
        this.redraw();
    },

    // PATTERN
    createTiledImagePattern(name, image, offsetX, offsetY) {
        var pattern = new OSurfacePattern();
        pattern.type = OSurfacePattern.TYPE_TILED_IMAGE;
        pattern.name = name;
        pattern.tiledImage = image;
        pattern.tiledImageOffsetX = offsetX;
        pattern.tiledImageOffsetY = offsetY;
        this.patterns[name] = pattern;
        this.loadBankImage(image);
    },

    // ACT_CREATE_LINEAR_GRADIENT_PATTERN
    createLinearGradientPattern(name, colorA, colorB, vertical) {
        var pattern = new OSurfacePattern();
        pattern.type = OSurfacePattern.TYPE_LINEAR_GRADIENT;
        pattern.name = name;
        pattern.colorA = colorA;
        pattern.colorB = colorB;
        pattern.vertical = vertical;
        this.patterns[name] = pattern;
    },

    createRadialGradientPattern(name, colorA, colorB) {
        var pattern = new OSurfacePattern();
        pattern.type = OSurfacePattern.TYPE_RADIAL_GRADIENT;
        pattern.name = name;
        pattern.colorA = colorA;
        pattern.colorB = colorB;
        this.patterns[name] = pattern;
    },

    createColorPattern(name, color) {
        var pattern = new OSurfacePattern();
        pattern.type = OSurfacePattern.TYPE_COLOR;
        pattern.name = name;
        pattern.color = color
        this.patterns[name] = pattern;
    },

    createCallbackPattern(name) {
        var pattern = new OSurfacePattern();
        pattern.type = OSurfacePattern.TYPE_CALLBACK;
        pattern.name = name;
        pattern.callbackContext = document.createElement("canvas").getContext("2d");
        this.patterns[name] = pattern;
    },

    getStyleByPattern(pattern, context) {
        switch (pattern.type) {
            case OSurfacePattern.TYPE_TILED_IMAGE:
                return context.createPattern(this.imageList[pattern.tiledImage].canvas, 'repeat');

            case OSurfacePattern.TYPE_LINEAR_GRADIENT:
                var gradient = context.createLinearGradient(0, 0, !pattern.vertical ? context.canvas.width : 0, pattern.vertical ? context.canvas.height : 0);
                gradient.addColorStop(0, pattern.colorA);
                gradient.addColorStop(1, pattern.colorB);
                return gradient;
            case OSurfacePattern.TYPE_RADIAL_GRADIENT:
                var gradient = context.createRadialGradient(context.canvas.width / 2, context.canvas.height / 2, 0, context.canvas.width / 2, context.canvas.height / 2, context.canvas.width / 2);
                gradient.addColorStop(0, pattern.colorA);
                gradient.addColorStop(1, pattern.colorB);
                return gradient;
            case OSurfacePattern.TYPE_COLOR:
                return pattern.color;

            case OSurfacePattern.TYPE_CALLBACK:
                var w = context.canvas.width;
                var h = context.canvas.height;
                if (w <= 0 || h <= 0)
                    return null;
                pattern.callbackContext.canvas.width = w;
                pattern.callbackContext.canvas.height = h;
                var pixels = pattern.callbackContext.getImageData(0, 0, w, h);
                var pixelData = pixels.data;
                for (var i = 0; i < pixelData.length; i += 4) {

                    this.callback.colorReturn = false;
                    this.extensionObject.ho.generateEvent(CRunSurface.CND_ON_CALLBACK, pattern.name);
                    if (this.callback.colorReturn) {
                        pixelData[i] = (this.callback.colNew >>> 16) & 0xFF;
                        pixelData[i + 1] = (this.callback.colNew >>> 8) & 0xFF;
                        pixelData[i + 2] = this.callback.colNew & 0xFF;
                        pixelData[i + 3] = 255;
                    }

                    this.callback.xPos = i % w;
                    this.callback.yPos = Math.floor(i / w);
                }
                pixels.data = pixelData;
                pattern.callbackContext.putImageData(pixels, 0, 0);

                return context.createPattern(pattern.callbackContext.canvas, 'repeat');
        }
    },

    hasPattern(name, context) {
        return typeof this.patterns[name] != "undefined";
    },

    getPattern(name) {
        return this.hasPattern(name) ? this.patterns[name] : null;
    },

    setColorOfPattern(name, color) {
        if (this.hasPattern(name)) {
            this.patterns[name].color = color;
        }
    },

    setColorsOfPattern(name, colorA, colorB) {
        if (this.hasPattern(name)) {
            this.patterns[name].colorA = colorA;
            this.patterns[name].colorB = colorB;
        }
    },

    setVerticalFlagOfPattern(name, verticalFlag) {
        if (this.hasPattern(name)) {
            this.patterns[name].vertical = verticalFlag == 1;
        }
    },

    setOriginOfPattern(name, x, y) {
        if (this.hasPattern(name)) {
            this.patterns[name].tiledImageOffsetX = x;
            this.patterns[name].tiledImageOffsetY = y;
        }
    },

    setImageOfPattern(name, image) {
        if (this.hasPattern(name)) {
            this.patterns[name].tiledImage = image;
        }
    },

    deletePattern(name) {
        if (this.hasPattern(name)) {
            this.patterns.splice(this.patterns.indexOf(name), 1);
        }
    },

    // BLIT
    setBlitSourcePosition(x, y) {
        this.blit.xSource = x;
        this.blit.ySource = y;
    },

    setBlitSourceDimension(w, h) {
        this.blit.wSource = w;
        this.blit.hSource = h;
    },

    setBlitSourceRegionflag(flag) {
        this.blit.regionflag = flag;
    },

    setBlitDestinationPosition(x, y) {
        this.blit.xDest = x;
        this.blit.yDest = y;
    },

    setBlitDestinationDimension(w, h) {
        this.blit.wDest = w;
        this.blit.hDest = h;
    },

    execBlit(sourceCanvas, destinationContext, onlyAlpha, useAlpha, image) {
        if (typeof onlyAlpha == "undefined") onlyAlpha = false;
        if (typeof useAlpha == "undefined") useAlpha = true;
        var dx = this.blit.xDest + this.getXCoord();
        var dy = this.blit.yDest + this.getYCoord();
        var dw = this.blit.wDest != null ? this.blit.wDest : sourceCanvas.width;
        var dh = this.blit.hDest != null ? this.blit.hDest : sourceCanvas.height;
        var sw = this.blit.wSource != null ? this.blit.wSource : sourceCanvas.width;
        var sh = this.blit.hSource != null ? this.blit.hSource : sourceCanvas.height;
        var sx = this.blit.regionflag ? this.blit.xSource : 0;
        var sy = this.blit.regionflag ? this.blit.ySource : 0;

        sw = Math.min(sw, sourceCanvas.width - sx);
        sh = Math.min(sh, sourceCanvas.height - sy);

        var angle = (Math.PI / 180) * this.blit.angle;

        if (typeof image == 'undefined') {
            image = null;
        }

        // percent
        var hotX = this.blit.xHotSpot;
        var hotY = this.blit.yHotSpot;
        var hotXp = (hotX * 100) / sw;
        var hotYp = (hotY * 100) / sh;

        // Re set hotspot by blit size
        hotX = Math.ceil((hotXp * sw) / 100);
        hotY = Math.ceil((hotYp * sh) / 100);

        if (this.blit.hotSpotMode & 2) {
            hotX = dw / 100.0 * hotX;
            hotY = dh / 100.0 * hotY;
        }

        var tmpSourceContext = document.createElement("canvas").getContext("2d");
        tmpSourceContext.canvas.width = dw;
        tmpSourceContext.canvas.height = dh;

        tmpSourceContext.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, dw, dh);

        switch (this.blit.effect) {
            case OSurface.BLIT_EFFECT_AND:
                destinationContext["globalCompositeOperation"] = "multiply";
                break;
            case OSurface.BLIT_EFFECT_XOR:
                destinationContext["globalCompositeOperation"] = "xor";
                break;
        }

        if (this.blit.callback != "" || onlyAlpha) { // Blit with effect /!\ can be slow
            destinationContext.save();

            var destinationImg = null;
            if (angle != 0) {
                // If there are rotation, need to create temp context to get rotated image data
                var tmpDestContext = document.createElement("canvas").getContext("2d");
                tmpDestContext.canvas.width = dw;
                tmpDestContext.canvas.height = dh;
                tmpDestContext.translate(hotX, hotY);
                tmpDestContext.rotate(angle);
                tmpDestContext.translate(-hotX, -hotY);
                tmpDestContext.drawImage(destinationContext.canvas, dx - hotX, dy - hotY, dw, dh, 0, 0, dw, dh);
                destinationImg = tmpDestContext.getImageData(0, 0, dw, dh);
            } else {
                destinationImg = destinationContext.getImageData(dx - hotX, dy - hotY, dw, dh);
            }

            var destinationImgData = destinationImg.data;
            var sourceImg = null;
            var sourceImgData = null;
            sourceImg = tmpSourceContext.getImageData(0, 0, dw, dh);
            sourceImgData = sourceImg.data;

            for (var i = 0; i < destinationImgData.length; i += 4) {

                if (onlyAlpha) {
                    sourceImgData[i + 3] = destinationImgData[i + 3];
                    continue;
                }

                switch (this.blit.effect.toLowerCase()) {

                    case OSurface.BLIT_EFFECT_OR:
                        sourceImgData[i] = sourceImgData[i] | destinationImgData[i];
                        sourceImgData[i + 1] = sourceImgData[i + 1] | destinationImgData[i + 1];
                        sourceImgData[i + 2] = sourceImgData[i + 2] | destinationImgData[i + 2];
                        //sourceImgData[i+3] = sourceImgData[i+3] | destinationImgData[i+3];
                        break;

                    case OSurface.BLIT_EFFECT_SEMI_TRANSPARENCY:
                        sourceImgData[i + 3] = this.blit.alpha;
                        break;

                    case OSurface.BLIT_EFFECT_TINT:
                        var r = (this.blit.tint >>> 16) & 0xFF,
                            g = (this.blit.tint >>> 8) & 0xFF,
                            b = this.blit.tint & 0xFF;

                        sourceImgData[i] = Math.max(0, Math.min(255, (r - sourceImgData[i]) * 0.5 + sourceImgData[i]));
                        sourceImgData[i + 1] = Math.max(0, Math.min(255, (g - sourceImgData[i + 1]) * 0.5 + sourceImgData[i + 1]));
                        sourceImgData[i + 2] = Math.max(0, Math.min(255, (b - sourceImgData[i + 2]) * 0.5 + sourceImgData[i + 2]));
                        break;
                }

                if (this.blit.callback != "") {
                    this.callback.colorReturn = false;
                    this.extensionObject.ho.generateEvent(CRunSurface.CND_ON_CALLBACK, this.blit.callback);
                    if (this.callback.colorReturn) {
                        sourceImgData[i] = (this.callback.colNew >>> 16) & 0xFF;
                        sourceImgData[i + 1] = (this.callback.colNew >>> 8) & 0xFF;
                        sourceImgData[i + 2] = this.callback.colNew & 0xFF;
                        sourceImgData[i + 3] = 255;
                    }

                    this.callback.xPos = i % dw;
                    this.callback.yPos = Math.floor(i / dw);
                }

            }
            sourceImg.data = sourceImgData;
            tmpSourceContext.putImageData(sourceImg, 0, 0);
        }

        destinationContext.save();

        if (!this.blit.useTransparency) {
            destinationContext.clearRect(dx, dy, dw, dh);
        }

        if (angle != 0) {
            destinationContext.translate(dx, dy);
            destinationContext.rotate(-angle);
            destinationContext.translate(-dx, -dy);
        }

        if (!this.blit.alphaComposition && useAlpha) {
            //alphaData = destinationContext.getImageData(dx - hotX, dy - hotY, dw, dh);
            //alphaPixelData = alphaData.data;
            destinationContext["globalCompositeOperation"] = "source-atop";
        }

        //destinationContext.translate(-hotX, -hotY);
        let x = dx - hotX;
        let y = dy - hotY;

        destinationContext.drawImage(
            tmpSourceContext.canvas,
            x,
            y,
            dw,
            dh
        );

        //destinationContext.translate(-hotSpot.x, -hotSpot.y);

        if (!this.blit.alphaComposition && useAlpha) {
            /*var newAlphaData = destinationContext.getImageData(dx - hotX, dy - hotY, dw, dh);
            var newAlphaPixelData = newAlphaData.data;
            for (var i = 0; i< newAlphaPixelData.length; i+=4) {
                newAlphaPixelData[i+3] = alphaPixelData[i+3];
            }
            newAlphaData.data = newAlphaPixelData;
            destinationContext.putImageData(newAlphaData, dx-hotX, dy - hotY);*/
            destinationContext["globalCompositeOperation"] = "source-over";
        }

        destinationContext.restore();
        destinationContext["globalCompositeOperation"] = "source-over";

        if (this.currentImage == this.selectedImage)
            this.redraw(); //this.redrawPart(dx, dy, dw, dh);

        if (!useAlpha) {
            this.imageList[this.selectedImage].updateTransparent = true;
        }

    },

    blitImage(image) {
        if (this.hasImageIndex(image)) {
            this.loadBankImage(image);
            this.execBlit(this.imageList[image].canvas, this.imageList[this.selectedImage].context, false, (this.imageList[image].hasAlphaChannel && this.imageList[this.selectedImage].hasAlphaChannel), this.imageList[this.selectedImage]);
        }
    },

    blitOntoImage(image, onlyAlpha) {
        if (this.hasImageIndex(image)) {
            this.loadBankImage(image);
            this.execBlit(this.imageList[this.selectedImage].context, this.imageList[image].canvas, onlyAlpha);
        }
    },

    blitImageHandle(handle) {
        var image = this.extensionObject.rh.rhApp.imageBank.getImageFromHandle(handle);
        if (image != null) {
            var tempCtx = document.createElement("canvas").getContext("2d");
            if (image.mosaic == 0 && image.img != null) {
                tempCtx.canvas.width = image.width;
                tempCtx.canvas.height = image.height;
                tempCtx.drawImage(image.img, 0, 0);

            } else {
                tempCtx.canvas.width = image.width;
                tempCtx.canvas.height = image.height;
                tempCtx.drawImage(image.app.imageBank.mosaics[image.mosaic],
                    image.mosaicX, image.mosaicY,
                    image.width, image.height,
                    0, 0,
                    image.width, image.height
                );
            }
            this.execBlit(tempCtx.canvas, this.imageList[this.selectedImage].context, false, this.imageList[this.selectedImage].hasAlphaChannel);
        }
    },

    setBlitEffect(effect) {
        this.blit.effect = effect;
    },

    pushBlitSettings() {
        this.savedBlit = this.blit;
    },

    popBlitSettings() {
        if (this.savedBlit != null) {
            this.blit = this.savedBlit;
        }
    },

    // Polygon
    newPoint(x, y) {
        return {
            x: Math.floor(x),
            y: Math.floor(y)
        };
    },

    moveAllPoints(x, y) {
        for (var i = 0; i < this.points.length; i++) {
            this.points.x += x;
            this.points.y += y;
        }
    },

    addPointAt(x, y, index) {
        if (index < 0) {
            this.points.unshift(this.newPoint(x, y));
        } else {
            this.points.splice(index, 0, this.newPoint(x, y));
        }
    },

    addPoint(x, y) {
        this.addPointAt(x, y, this.points.length);
    },

    deleteAllPoints() {
        this.points = [];
    },

    drawPolygon(x, y, patternName, borderSize, borderPattern) {
        if (this.points.length < 3) {
            return;
        }

        x += this.getXCoord();
        y += this.getYCoord();

        var pattern = this.patterns[patternName];
        var ctx = document.createElement("canvas").getContext("2d");
        if ((patternName == CServices.getColorString(this.imageList[this.selectedImage].transparentColor))) {
            ctx.globalAlpha = 1;
            this.context["globalCompositeOperation"] = "destination-in";
        }

        var xMin = this.points[0].x;
        var yMin = this.points[0].y;
        var xMax = xMin;
        var yMax = yMin;
        for (var i = 1; i < this.points.length; i++) {
            xMin = Math.min(this.points[i].x, xMin);
            yMin = Math.min(this.points[i].y, yMin);
            xMax = Math.max(this.points[i].x, xMax);
            yMax = Math.max(this.points[i].y, yMax);
        }

        var rect = this.getRectByBox(0, 0, xMax - xMin, yMax - yMin);
        if (rect.w == 0 || rect.h == 0) return;
        this.storeAlpha(rect.x + x, rect.y + y, rect.w, rect.h);
        ctx.canvas.width = rect.w;
        ctx.canvas.height = rect.h;
        ctx.fillStyle = this.hasPattern(patternName) ? this.getStyleByPattern(pattern, ctx) : patternName;
        ctx.beginPath();
        ctx.moveTo(this.points[0].x - xMin, this.points[0].y - yMin);
        for (var i = 1; i < this.points.length; i++) {
            ctx.lineTo(this.points[i].x - xMin, this.points[i].y - yMin);
        }

        ctx.closePath();
        if (patternName != -1) { // -1 = no color
            ctx.fill();
        }

        if (borderSize > 0) {
            ctx.lineWidth = borderSize;
            var pattern2 = this.patterns[borderPattern];
            ctx.strokeStyle = this.hasPattern(borderPattern) ? this.getStyleByPattern(pattern2, ctx) : borderPattern;
            ctx.stroke();
        }
        this.restoreAlpha(rect.x + x, rect.y + y, rect.w, rect.h);
        this.context["globalCompositeOperation"] = "source-over";
        if (ctx.canvas.width > 0 && ctx.canvas.height > 0) {
            this.imageList[this.selectedImage].context.drawImage(ctx.canvas, x + xMin, y + yMin, ctx.canvas.width, ctx.canvas.height);
            this.redrawPart(rect.x + x, rect.y + y, rect.w, rect.h);
        }

        if (!this.keepPoints) {
            this.deleteAllPoints();
        }

    },

    rotateAllPointsArround(x, y, angle) {
        var rad = ((angle * 3.1415926535) / 180);
        var relativeXPos = 0;
        var relativeYPos = 0;
        for (var i = 0; i < this.points.length; i++) {
            relativeXPos = this.points[i].x - x;
            relativeYPos = this.points[i].y - y;
            this.setPoint(
                i,
                (Math.cos(rad) * relativeXPos) + (-Math.sin(rad) * relativeYPos),
                (Math.sin(rad) * relativeXPos) + (Math.cos(rad) * relativeYPos)
            );
        }
    },

    setPoint(index, x, y) {
        if (typeof this.points[index] == "undefined") return;

        this.points[index] = this.newPoint(x, y);
    },

    scaleAllPointsArround(x, y, scaleX, scaleY) {
        for (var i = 0; i < this.points.length; i++) {
            this.setPoint(i, x + scaleX * (this.points[i].x - x), y + scaleY * (this.points[i].y - y));
        }
    },

    createRegularPolygon(radius, nbEdges) {
        this.deleteAllPoints();
        var step = (2 * 3.1415926535) / nbEdges;

        for (i = 0; i < nbEdges; i++) {
            var xPos, yPos;
            xPos = (Math.cos(step * i) * radius);
            yPos = (Math.sin(step * i) * radius);

            this.addPoint(xPos, yPos);
        }
    },

    createStar(innerRadius, outerRadius, nbPikes) {
        var step = (2 * 3.1415926535) / (nbPikes * 2);

        for (i = 0; i < nbPikes * 2; i++) {
            var xPos, yPos;

            if (i % 2 == 0) {
                xPos = (Math.cos(step * i) * innerRadius);
                yPos = (Math.sin(step * i) * innerRadius);
            } else {
                xPos = (Math.cos(step * i) * outerRadius);
                yPos = (Math.sin(step * i) * outerRadius);
            }

            this.addPoint(xPos, yPos);
        }
    },

    // TEXT
    drawText(x1, y1, x2, y2, text, color) {
        var tempCtx = document.createElement("canvas").getContext("2d");
        tempCtx.canvas.width = this.imageList[this.selectedImage].canvas.width;
        tempCtx.canvas.height = this.imageList[this.selectedImage].canvas.height;
        var decoration = "";
        switch (this.textParams.decoration) {
            case 1:
                decoration = "italic";
                break;
            case 2: // Underline

                break;
            case 4: // Strike
                break;
        }
        tempCtx.font = decoration + " " + (this.textParams.weight * 100) + " " + this.textParams.size + " " + this.textParams.family;
        tempCtx.fillStyle = CServices.getColorString(color);
        var rect = this.getRectByBox(x1, y1, x2, y2);
        switch (this.textParams.hAlign) {
            case 0: tempCtx.textAlign = "left"; break;
            case 1: tempCtx.textAlign = "center"; break;
            case 2: tempCtx.textAlign = "right"; break;
        }

        switch (this.textParams.vAlign) {
            case 0: tempCtx.textBaseline = "top"; break;
            case 1: tempCtx.textBaseline = "middle"; break;
            case 2: tempCtx.textBaseline = "bottom"; break;
        }

        var width = tempCtx.measureText(text).width;
        tempCtx.fillText(text, 0, 0);
        var cx = x1 + 0.5 * width;
        var cy = y1/* + 0.5 * parseInt(this.textParams.size)*/;
        var rad = this.textParams.angle * Math.PI / 180;
        this.imageList[this.selectedImage].context.save();
        if (this.textParams.angle != 0) {
            this.imageList[this.selectedImage].context.translate(cx + this.getYCoord(), cy + this.getYCoord());
            this.imageList[this.selectedImage].context.rotate(-rad);
            this.imageList[this.selectedImage].context.translate(-(cx + this.getYCoord()), -(cy + this.getYCoord()));
        }
        this.imageList[this.selectedImage].context.drawImage(tempCtx.canvas, x1 + this.getXCoord(), y1 + this.getYCoord());

        this.imageList[this.selectedImage].context.restore();

        this.redraw();
    },

    // CALLBACK
    loopThroughImageWithCallback(name, flags, callback, x1, y1, x2, y2) {
        //Flags
        var doRead = flags & 1;
        var doWrite = flags & 2;
        var doXY = flags & 4;
        var doReadA = flags & 8;
        var doWriteA = flags & 16;

        var x = 0;
        var y = 0;
        var w = this.imageList[this.selectedImage].getWidth();
        var h = this.imageList[this.selectedImage].getHeight();

        if (typeof x1 == typeof y1 == typeof x2 == typeof y2 == "number") {
            var rect = this.getRectByBox(x1, y1, x2, y2);
            x = rect.x;
            y = rect.y;
            w = rect.w;
            h = rect.h;
        }

        var imageData = this.imageList[this.selectedImage].context.getImageData(x, y, w, h);
        this.imageList[this.selectedImage].useTransparentColor = false;

        var pixelData = imageData.data;
        this.callback.xPos = 0;
        this.callback.yPos = 0;
        for (var i = 0; i < w * h; i++) {
            if (doRead) {
                this.callback.colSrc = (pixelData[i * 4] << 16) | (pixelData[i * 4 + 1] << 8) | pixelData[i * 4 + 2];
                this.callback.colNew = this.callback.colSrc;
            }

            if (doReadA) {
                this.callback.alphaSrc = pixelData[i * 4 + 3];
            }

            if (doXY) {
                this.callback.xPos = i % w;
                this.callback.yPos = Math.floor(i / w);
            }

            this.callback.colorReturn = false;

            if (typeof callback == "function")
                callback(name);

            if (doWrite && this.callback.colorReturn) {
                pixelData[i * 4] = (this.callback.colNew >>> 16) & 0xFF;
                pixelData[i * 4 + 1] = (this.callback.colNew >>> 8) & 0xFF;
                pixelData[i * 4 + 2] = this.callback.colNew & 0xFF;
                pixelData[i * 4 + 3] = 255;
            }

            if (doWriteA && this.callback.alphaReturn) {
                pixelData[i * 4 + 3] = this.callback.alphaNew;
            }
        }

        if (doWrite) {
            imageData.data = pixelData;
            this.imageList[this.selectedImage].context.putImageData(imageData, x, y);
        }
    },

    setReturnColor(color) {
        if (!this.callback.colorReturn) {
            this.callback.colNew = color;
            this.callback.colorReturn = true;
        }
    },

    setReturnAlpha(alpha) {
        if (!this.callback.alphaReturn) {
            alpha = alpha < 0 ? 0 : alpha;
            alpha = alpha > 255 ? 255 : alpha;
            this.callback.alphaNew = alpha;
            this.callback.alphaReturn = true;
        }
    },

    colorsMatch(a, b, rangeSq) {
        const dr = a[0] - b[0];
        const dg = a[1] - b[1];
        const db = a[2] - b[2];
        const da = a[3] - b[3];

        return dr * dr + dg * dg + db * db + da * da < rangeSq;
    },

    setPixel(imageData, x, y, color) {
        const offset = (y * imageData.width + x) * 4;
        imageData.data[offset + 0] = color[0];
        imageData.data[offset + 1] = color[1];
        imageData.data[offset + 2] = color[2];
        imageData.data[offset + 3] = color[0];
    },

    getPixel(imageData, x, y) {
        if (x < 0 || y < 0 || x >= imageData.width || y >= imageData.height) {
            return [-1, -1, -1, -1];  // impossible color
        } else {
            const offset = (y * imageData.width + x) * 4;
            return imageData.data.slice(offset, offset + 4);
        }
    },

    floodFill(x, y, fillColor, range = 1) {
        fillColor = [CServices.getRValueFlash(fillColor), CServices.getGValueFlash(fillColor), CServices.getBValueFlash(fillColor), 255];

        // read the pixels in the canvas
        const imageData = this.imageList[this.selectedImage].context.getImageData(0, 0, this.imageList[this.selectedImage].canvas.width, this.imageList[this.selectedImage].canvas.height);

        // flags for if we visited a pixel already
        const visited = new Uint8Array(imageData.width, imageData.height);

        // get the color we're filling
        const targetColor = this.getPixel(imageData, x, y);

        // check we are actually filling a different color
        if (!this.colorsMatch(targetColor, fillColor, range)) {

            const rangeSq = range * range;
            const pixelsToCheck = [x, y];
            while (pixelsToCheck.length > 0) {
                const y = pixelsToCheck.pop();
                const x = pixelsToCheck.pop();
                this.floodArea.x1 = Math.min(this.floodArea.x1, x);
                this.floodArea.y1 = Math.min(this.floodArea.y1, y);
                this.floodArea.x2 = Math.max(this.floodArea.x2, x);
                this.floodArea.y2 = Math.max(this.floodArea.y2, y);

                const currentColor = this.getPixel(imageData, x, y);
                if (!visited[y * imageData.width + x] && this.colorsMatch(currentColor, targetColor, rangeSq)) {
                    this.setPixel(imageData, x, y, fillColor);
                    visited[y * imageData.width + x] = 1;  // mark we were here already
                    pixelsToCheck.push(x + 1, y);
                    pixelsToCheck.push(x - 1, y);
                    pixelsToCheck.push(x, y + 1);
                    pixelsToCheck.push(x, y - 1);
                }
            }

            // put the data back
            this.imageList[this.selectedImage].context.putImageData(imageData, 0, 0);
        }

        this.redraw();
    },

    applyColorMatrix(colorMatrix) {
        var imageData = this.imageList[this.selectedImage].context.getImageData(0, 0, this.imageList[this.selectedImage].getWidth(), this.imageList[this.selectedImage].getHeight());
        var pixelData = imageData.data;
        for (var i = 0; i < pixelData.length; i += 4) {
            var r = pixelData[i];
            var g = pixelData[i + 1];
            var b = pixelData[i + 2];
            pixelData[i] = Math.max(0, Math.min(255, r * colorMatrix[0][0] + g * colorMatrix[0][1] + b * colorMatrix[0][2]));
            pixelData[i + 1] = Math.max(0, Math.min(255, r * colorMatrix[1][0] + g * colorMatrix[1][1] + b * colorMatrix[1][2]));
            pixelData[i + 2] = Math.max(0, Math.min(255, r * colorMatrix[2][0] + g * colorMatrix[2][1] + b * colorMatrix[2][2]));
        }
        imageData.data = pixelData;
        this.imageList[this.selectedImage].context.putImageData(imageData, 0, 0);

        this.redraw();
    },

    applyConvolutionMatrix(divisor, offset, iterations, matrix) {
        var m = [].concat(matrix[0], matrix[1], matrix[2]); // flatten
        if (!divisor) {
            divisor = m.reduce(function (a, b) { return a + b; }) || 1; // sum
        }
        var olddata = this.imageList[this.selectedImage].context.getImageData(0, 0, this.imageList[this.selectedImage].getWidth(), this.imageList[this.selectedImage].getHeight());
        var oldpx = olddata.data;
        var newdata = this.imageList[this.selectedImage].context.createImageData(olddata);
        var newpx = newdata.data
        var len = newpx.length;
        var res = 0;
        var w = this.imageList[this.selectedImage].getWidth();
        for (var i = 0; i < len; i++) {
            if ((i + 1) % 4 === 0) {
                newpx[i] = oldpx[i];
                continue;
            }
            res = 0;
            var these = [
                oldpx[i - w * 4 - 4] || oldpx[i],
                oldpx[i - w * 4] || oldpx[i],
                oldpx[i - w * 4 + 4] || oldpx[i],
                oldpx[i - 4] || oldpx[i],
                oldpx[i],
                oldpx[i + 4] || oldpx[i],
                oldpx[i + w * 4 - 4] || oldpx[i],
                oldpx[i + w * 4] || oldpx[i],
                oldpx[i + w * 4 + 4] || oldpx[i]
            ];
            for (var j = 0; j < 9; j++) {
                res += these[j] * m[j];
            }
            res /= divisor;
            if (offset) {
                res += offset;
            }
            newpx[i] = res;
        }
        this.imageList[this.selectedImage].context.putImageData(newdata, 0, 0);

        this.redraw();
    },

    moveChannels(r, g, b, a) {
        if (r == 'r' && g == 'g' && b == 'b' && a == 'a') return;
        var ctx = this.imageList[this.selectedImage].context;
        var imgData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
        var pixelData = imgData.data;
        var oldPixelData = pixelData.slice();
        for (var i = 0; i < pixelData.length; i += 4) {
            switch (r) {
                case 'g': pixelData[i] = oldPixelData[i + 1]; break;
                case 'b': pixelData[i] = oldPixelData[i + 2]; break;
                case 'a': pixelData[i] = oldPixelData[i + 3]; break;
            }
            switch (g) {
                case 'r': pixelData[i + 1] = oldPixelData[i]; break;
                case 'b': pixelData[i + 1] = oldPixelData[i + 2]; break;
                case 'a': pixelData[i + 1] = oldPixelData[i + 3]; break;
            }
            switch (b) {
                case 'r': pixelData[i + 2] = oldPixelData[i]; break;
                case 'g': pixelData[i + 2] = oldPixelData[i + 1]; break;
                case 'a': pixelData[i + 2] = oldPixelData[i + 3]; break;
            }
            switch (a) {
                case 'r': pixelData[i + 3] = oldPixelData[i]; break;
                case 'g': pixelData[i + 3] = oldPixelData[i + 1]; break;
                case 'b': pixelData[i + 3] = oldPixelData[i + 2]; break;
            }
        }
        this.imageList[this.selectedImage].context.putImageData(imgData, 0, 0);
        this.redraw();
    },

    cropImage(x1, y1, x2, y2) {
        var ctx = this.imageList[this.selectedImage].context;
        var tempCtx = document.createElement("canvas").getContext("2d");
        var w = Math.abs(x2 - x1);
        var h = Math.abs(y2 - y1);
        var oldW = ctx.canvas.width;
        var oldH = ctx.canvas.height;
        tempCtx.canvas.width = w;
        tempCtx.canvas.height = h;
        var x = (w - oldW) / 2;
        var y = (h - oldH) / 2;
        tempCtx.drawImage(ctx.canvas, x1, y2, Math.max(w, oldW), Math.max(h, oldH), 0, 0, Math.max(w, oldW), Math.max(h, oldH));
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = CServices.getColorString(this.imageList[this.selectedImage].transparentColor);
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(tempCtx.canvas, Math.min(0, x), Math.min(0, y));
    },

    saveImage(path, overrideExt) {
        path = path.replace(/^.*[\\\/]/, '');
        var c = this.imageList[this.selectedImage].canvas.toDataURL("image/png");
        var img = new Image();
        img.src = c;
        var win = window.open("", path);
        win.document.body.appendChild(img);

    },

    perform(op, val, channels) {
        var dor = channels.includes('r');
        var dog = channels.includes('g');
        var dob = channels.includes('b');
        var doa = channels.includes('a');

        if (!['+', '-', '*', '/', '**', '%', '<', '>', '&', '|', '^', '<<', '>>', '='].includes(op)) return;

        var ctx = this.imageList[this.selectedImage].context;
        var imgData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
        var pixelData = imgData.data;
        for (var i = 0; i < pixelData.length; i += 4) {
            if (dor) pixelData[i] = this.operation(op, pixelData[i], val);
            if (dog) pixelData[i + 1] = this.operation(op, pixelData[i + 1], val);
            if (dob) pixelData[i + 2] = this.operation(op, pixelData[i + 2], val);
            if (doa) pixelData[i + 3] = this.operation(op, pixelData[i + 3], val);
        }
        this.imageList[this.selectedImage].context.putImageData(imgData, 0, 0);
        this.redraw();
    },

    performColor(op, color) {

        var r = (color >>> 16) & 0xFF,
            g = (color >>> 8) & 0xFF,
            b = color & 0xFF;

        if (!['+', '-', '*', '/', '**', '%', '<', '>', '&', '|', '^', '<<', '>>', '='].includes(op)) return;

        var ctx = this.imageList[this.selectedImage].context;
        var imgData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
        var pixelData = imgData.data;
        for (var i = 0; i < pixelData.length; i += 4) {
            pixelData[i] = this.operation(op, pixelData[i], r);
            pixelData[i + 1] = this.operation(op, pixelData[i + 1], g);
            pixelData[i + 2] = this.operation(op, pixelData[i + 2], b);
        }
        this.imageList[this.selectedImage].context.putImageData(imgData, 0, 0);
        this.redraw();
    },

    operation(op, pixel, value) {
        if ((op == '/' || op == '%') && value == 0) {
            value = 0.001;
        }
        newVal = pixel;
        switch (op) {
            case '+':
                newVal = pixel + value;
                break;
            case '-':
                newVal = pixel - value;
                break;
            case '/':
                newVal = pixel / value;
                break;
            case '*':
                newVal = pixel * value;
                break;
            case '**':
                newVal = Math.pow(pixel / 255.0, value) * 255;
                break;
            case '%':
                newVal = pixel % value;
                break;
            case '<':
                newVal = Math.min(pixel, value);
                break;
            case '>':
                newVal = Math.max(pixel, value);
                break;
            case '&':
                newVal = pixel & value;
                break;
            case '|':
                newVal = pixel | value;
                break;
            case '^':
                newVal = pixel ^ value;
                break;
            case '<<':
                newVal = pixel << value;
                break;
            case '>>':
                newVal = pixel >> value;
                break;
            case '=':
                newVal = value;
                break;
        }

        return Math.max(0, Math.min(255, newVal));
    }
};

// Definition of the conditions, actions and expressions codes.
// ---------------------------------------------------------------
CRunSurface.CND_HAS_ALPHA = 0; // OK
CRunSurface.CND_AVAILABLE_IN_CLIPBOARD = 1; // NOT IMPLEMENTED
CRunSurface.CND_ON_LOADING_FAILED = 2; // OK
CRunSurface.CND_ON_SAVING_FAILED = 3; // NOT POSSIBLE
CRunSurface.CND_ON_LOADING_SUCCEEDED = 4; // OK
CRunSurface.CND_ON_SAVING_SECCEEDED = 5; // NOT POSSIBLE
CRunSurface.CND_RGB_AT = 6; // OK
CRunSurface.CND_SELECT_IMAGE = 7; // OK
CRunSurface.CND_ON_CALLBACK = 8; // OK
CRunSurface.CND_DISPLAYED_IMAGE = 9; // OK
CRunSurface.CND_SELECTED_IMAGE = 10; // OK
CRunSurface.CND_RED_AT = 11;  // OK
CRunSurface.CND_GREEN_AT = 12; // OK
CRunSurface.CND_BLUE_AT = 13; // OK
CRunSurface.CND_PATTERN_EXIST = 14; // OK
CRunSurface.CND_BUFFER_IS_LOCKED = 15; // NOT POSSIBLE
CRunSurface.CND_IS_INSIDE_IMAGE = 16; // OK
CRunSurface.CND_FILE_IO_IS_IN_PROGRESS = 17; // OK
CRunSurface.CND_FILE_IS_BEHIND_SAVED = 18; // NOT POSSIBLE
CRunSurface.CND_FILE_IS_BEHIND_LOADED = 19; // OK

CRunSurface.CND_LAST = 20;

CRunSurface.ACT_BLIT_INTO_IMAGE = 0; // OK
CRunSurface.ACT_DISPLAY_IMAGE = 1; // OK
CRunSurface.ACT_SET_PIXEL_AT = 2; // OK
CRunSurface.ACT_CLEAR_WITH_COLOR = 3; // OK
CRunSurface.ACT_CREATE_ALPHA_CHANNEL = 4; // OK
CRunSurface.ACT_SET_ALPHA_AT = 5; // OK
CRunSurface.ACT_CLEAR_ALPHA_WITH = 6; // OK
CRunSurface.ACT_DRAW_RECTANGLE_WITH_ALPHA = 7; // OK
CRunSurface.ACT_DRAW_ELLIPSE = 8; // OK
CRunSurface.ACT_DRAW_RECTANGLE_WITH_COLOR_AND_THICKNESS = 9; // OK
CRunSurface.ACT_DRAW_LINE = 10; // OK
CRunSurface.ACT_DELETE_IMAGE = 11; // OK
CRunSurface.ACT_INSERT_IMAGE = 12; // OK
CRunSurface.ACT_RESIZE_IMAGE = 13; // OK
CRunSurface.ACT_SAVE_IMAGE_TO_FILE = 14; // OPEN NEW WINDOW
CRunSurface.ACT_LOAD_IMAGE_FROM_FILE_OVERRIDE_EXTENSION = 15;
CRunSurface.ACT_FLOOD_FILL = 16; // OK
CRunSurface.ACT_ADD_IMAGE = 17; // OK
CRunSurface.ACT_DELETE_ALL_IMAGES = 18; // OK
CRunSurface.ACT_BLIT_ONTO_IMAGE = 19; // OK
CRunSurface.ACT_REPLACE = 20; // OK
CRunSurface.ACT_FLIP_HORIZONTALY = 21; // OK
CRunSurface.ACT_FLIP_VERTICALY = 22; // OK
CRunSurface.ACT_MINIMIZE = 23; // OK
CRunSurface.ACT_SET_TRANSPARENT_COLOR = 24; // OK
CRunSurface.ACT_DRAW_LINE_WITH_ALPHA = 25; // OK
CRunSurface.ACT_PERFORM_COLOR = 26; // OK
CRunSurface.ACT_FORCE_REDRAW = 27; // OK
CRunSurface.ACT_COPY_IMAGE = 28; // OK
CRunSurface.ACT_SELECT_IMAGE = 29; // OK
CRunSurface.ACT_DRAW_POLYGON = 30; // OK
CRunSurface.ACT_INSERT_POINT = 31; // OK
CRunSurface.ACT_REMOVE_ALL_POINTS = 32; // OK
CRunSurface.ACT_ADD_POINT_FROM_STRING = 33; // OK
CRunSurface.ACT_MOVE_ALL_POINTS_BY_PIXEL = 34; // OK
CRunSurface.ACT_ROTATE_ALL_POINTS_ARROUND = 35; // OK
CRunSurface.ACT_REMOVE_POINT = 36; // OK
CRunSurface.ACT_SET_BLIT_TRANSPARENCY = 37; // OK
CRunSurface.ACT_SET_BLIT_ALPHA_MODE = 38; // OK
CRunSurface.ACT_SET_BLIT_SEMI_TRANSPARENCY = 39;
CRunSurface.ACT_SET_BLIT_EFFECT_BY_INDEX = 40; // OK
CRunSurface.ACT_SET_BLIT_DESTINATION_POSITION = 41; // OK
CRunSurface.ACT_SET_USE_ABSOLUTE_COORDS = 42; // OK
CRunSurface.ACT_CREATE_COLOR_PATTERN = 43; // OK
CRunSurface.ACT_DRAW_RECTANGLE_WITH_FILL_PATTERN = 44; // OK
CRunSurface.ACT_CREATE_TILED_IMAGE_PATTERN = 45; // OK
CRunSurface.ACT_CREATE_LINEAR_GRADIENT_PATTERN = 46; // OK
CRunSurface.ACT_LOAD_IMAGE_FROM_CLIPBOARD = 47; // NOT IMPLEMENTED
CRunSurface.ACT_SAVE_IMAGE_TO_CLIPBOARD = 48; // NOT IMPLEMENTED
CRunSurface.ACT_BLIT_ACTIVE_OBJECT = 49; // OK
CRunSurface.ACT_DRAW_ELLIPSE_WITH_PATTERN = 50; // OK
CRunSurface.ACT_DRAW_POLYGON_WITH_PATTERN = 51; // OK
CRunSurface.ACT_DRAW_TEXT = 52; // OK
CRunSurface.ACT_SET_HORIZONTAL_TEXT_ALIGN = 53; // OK
CRunSurface.ACT_SET_VERTICAL_TEXT_ALIGN = 54; // OK
CRunSurface.ACT_SET_TEXT_MULTILINE = 55; // NOT IMPLEMENTED
CRunSurface.ACT_SET_TEXT_FONT_FACE = 56; // OK
CRunSurface.ACT_SET_TEXT_FONT_SIZE = 57; // OK
CRunSurface.ACT_SET_TEXT_FONT_QUALITY = 58; // NOT POSSIBLE
CRunSurface.ACT_SET_TEXT_FONT_WEIGHT = 59; // OK
CRunSurface.ACT_SET_TEXT_FONT_DECORATION = 60; // NOT IMPLEMENTED
CRunSurface.ACT_APPLY_CONVOLUTION_MATRIX = 61; // OK
CRunSurface.ACT_BLIT_THE_BACKGROUND = 62; // OK
CRunSurface.ACT_BLIT_IMAGE = 63; // OK
CRunSurface.ACT_ADD_BACKDROP = 64; // OK
CRunSurface.ACT_BLIT_ONTO_THE_BACKGROUND = 65; // OK
CRunSurface.ACT_SET_BLIT_DESTINATION_DIMENSIONS = 66; // OK
CRunSurface.ACT_BLIT_ALPHA_CHANNEL = 67; // OK
CRunSurface.ACT_EXPORT_IMAGE_AS_OVERLAY = 68; // NOT POSSIBLE
CRunSurface.ACT_DRAW_LINE_WITH_PATTERN = 69; // OK
CRunSurface.ACT_BLIT_OVERLAY = 70; // NOT POSSIBLE
CRunSurface.ACT_BLIT_ONTO_OVERLAY = 71; // NOT POSSIBLE
CRunSurface.ACT_SET_COLOR_OF_PATTERN = 72; // OK
CRunSurface.ACT_SET_COLORS_OF_PATTERN = 73; // OK
CRunSurface.ACT_SET_VERTICAL_FLAG_OF_PATTERN = 74; // OK
CRunSurface.ACT_SET_ORIGIN_OF_PATTERN = 75; // OK
CRunSurface.ACT_SET_IMAGE_OF_PATTERN = 76; // OK
CRunSurface.ACT_DELETE_PATTERN = 77; // OK
CRunSurface.ACT_RESIZE_CANVAS = 78; // OK
CRunSurface.ACT_CLEAR_WITH_PATTERN = 79; // OK
CRunSurface.ACT_ROTATE_IMAGE = 80; // OK
CRunSurface.ACT_SET_LINEAR_RESAMPLING = 81; // OK
CRunSurface.ACT_BLIT_IMAGE_REFERENCED = 82; // NOT IMPLEMENTED
CRunSurface.ACT_BLIT_ONTO_IMAGE_REFERENCED = 83; // NOT IMPLEMENTED
CRunSurface.ACT_SET_TEXT_CLIPPING = 84; // NOT IMPLEMENTED
CRunSurface.ACT_SET_TEXT_ADD_ELLIPSIS = 85; // NOT IMPLEMENTED
CRunSurface.ACT_SET_TEXT_WORD_BREAK = 86; // NOT IMPLEMENTED
CRunSurface.ACT_BLIT_WINDOW = 87; // NOT POSSIBLE
CRunSurface.ACT_BLIT_ONTO_WINDOW = 88; // NOT POSSIBLE
CRunSurface.ACT_BLIT_ONTO_IMAGE_OF_SURFACE = 89; // OK
CRunSurface.ACT_BLIT_IMAGE_OF_SURFACE = 90; // OK
CRunSurface.ACT_SWAP_IMAGES = 91; // OK
CRunSurface.ACT_MOVE_CHANNELS = 92; // OK
CRunSurface.ACT_SCROLL = 93; // OK
CRunSurface.ACT_RETURN_COLOR_TO_CALLBACK = 94; // OK
CRunSurface.ACT_LOOP_THROUNGH_IMAGE_WITH_CALLBACK = 95; // OK
CRunSurface.ACT_SET_CLIPPING_RECTANGLE = 96; // OK
CRunSurface.ACT_CLEAR_CLIPPING_RECTANGLE = 97; // OK
CRunSurface.ACT_INVERT_IMAGE = 98; // OK
CRunSurface.ACT_CREATE_STAR = 99; // OK
CRunSurface.ACT_SCALE_ALL_POINTS = 100; // OK
CRunSurface.ACT_DRAW_ELLIPSE_WITH_SIZE_AND_COLOR_THICKNESS = 101; // OK
CRunSurface.ACT_DRAW_ELLIPSE_WITH_SIZE_AND_PATTERN = 102; // OK
CRunSurface.ACT_CREATE_REGULAR_POLYGON = 103; // OK
CRunSurface.ACT_SKYP_REDRAW = 104; // OK
CRunSurface.ACT_SET_BLIT_DESTINATION = 105; // OK 
CRunSurface.ACT_CONVERT_TO_GRAYSCALE = 106; // OK
CRunSurface.ACT_CREATE_RADIAL_GRADIENT_PATTERN = 107; // OK
CRunSurface.ACT_SET_BLIT_EFFECT = 108; // NOT IMPLEMENTED
CRunSurface.ACT_SET_DISPLAY_SELECTED_IMAGE = 109; // OK
CRunSurface.ACT_SET_SELECT_NEW_IMAGE = 110; // OK
CRunSurface.ACT_SET_TRANSPARENT = 111; // OK
CRunSurface.ACT_LOCK_BUFFER = 112; // NOT POSSIBLE
CRunSurface.ACT_UNLOCK_BUFFER = 113; // NOT POSSIBLE
CRunSurface.ACT_SET_BLIT_SOURCE_POSITION = 114; // OK
CRunSurface.ACT_SET_BLIT_SOURCE_DIMENSIONS = 115; // OK
CRunSurface.ACT_SET_BLIT_STRETCH_MODE = 116; // OK
CRunSurface.ACT_SET_BLIT_REGION_FLAG = 117; // OK
CRunSurface.ACT_SET_TEXT_ANGLE = 118; // OK
CRunSurface.ACT_DRAW_RECTANGLE_WITH_SIZE_AND_COLOR_OUTLINE = 119; // OK
CRunSurface.ACT_DRAW_RECTANGLE_WITH_SIZE_AND_PATTERN = 120; // OK
CRunSurface.ACT_COPY_IMAGE_FROM_IMAGE_SURFACE = 121; // OK
CRunSurface.ACT_BLIT_ACTIVE_OBJECT_AT_POSITION = 122; // OK
CRunSurface.ACT_PERFORM_WITH_CHANNEL = 123; // OK
CRunSurface.ACT_BLIT_ALPHA_CHANNEL_ONTO_IMAGE = 124; // OK
CRunSurface.ACT_BLIT_IMAGE_ALPHA_CHANNEL_ONTO_ALPHA_CHANNEL = 125; // OK
CRunSurface.ACT_SET_BLIT_EFFECT_BY_NAME = 126; // OK
CRunSurface.ACT_REMOVE_ALPHA_CHANNEL = 127; // OK
CRunSurface.ACT_WRITE_BYTES = 128; // NOT IMPLEMENTED
CRunSurface.ACT_ADD_IMAGE_REFERENCE_FOR = 129; // NOT IMPLEMENTED
CRunSurface.ACT_INSERT_IMAGE_REFERENCE_FOR = 130; // NOT IMPLEMENTED
CRunSurface.ACT_COPY_IMAGE_FROM_IMAGE_REFERENCED = 131; // NOT IMPLEMENTED
CRunSurface.ACT_SET_REFERENCE_VALUE_OF_IMAGE = 132; // NOT IMPLEMENTED
CRunSurface.ACT_SET_REFERENCE_STATE_OF_IMAGE = 133; // NOT IMPLEMENTED
CRunSurface.ACT_SET_KEEP_POINTS_AFTER_DRAWING = 134; // OK
CRunSurface.ACT_SET_BACKGROUND_FILE_INPUT_OUTPUT = 135; // NOT IMPLEMENTED
CRunSurface.ACT_SET_BLIT_CALLBACK_TO = 136; // OK
CRunSurface.ACT_LOOP_THROUGH_WITH_CALLBACK = 137; // OK
CRunSurface.ACT_RETURN_ALPHA_TO_CALLBACK = 138; // OK
CRunSurface.ACT_SET_SCALE = 139; // OK
CRunSurface.ACT_SET_X_SCALE = 140; // OK
CRunSurface.ACT_SET_Y_SCALE = 141; // OK
CRunSurface.ACT_ADD_POINT = 142; // OK
CRunSurface.ACT_SET_HOT_SPOT_TO_PX = 143; // OK
CRunSurface.ACT_SET_HOT_SPOT_TO_PERCENT = 144; // OK
CRunSurface.ACT_CREATE_CALLBACK_PATTERN = 145; // OK
CRunSurface.ACT_SET_BLIT_SOURCE = 146; // OK
CRunSurface.ACT_SET_BLIT_ANGLE = 147; // OK
CRunSurface.ACT_SET_BLIT_HOT_SPOT = 148; // OK
CRunSurface.ACT_SET_BLIT_HOT_SPOT_FLAG = 149; // OK
CRunSurface.ACT_SET_BLIT_HOT_SPOT_PERCENT = 150; // OK
CRunSurface.ACT_SET_BLIT_ROTATION_QUALITY = 151; // NOT POSSIBLE
CRunSurface.ACT_SET_ANGLE = 152; // OK
CRunSurface.ACT_LOAD_IMAGE_FROM_FILE = 153; // OK
CRunSurface.ACT_CONVERT_TO_HWA_TEXTURE = 154; // NOT POSSIBLE
CRunSurface.ACT_CONVERT_TO_HWA_TARGET = 155; // NOT POSSIBLE
CRunSurface.ACT_CONVERT_TO_BITMAP = 156; // NOT POSSIBLE
CRunSurface.ACT_SET_BLIT_TINT = 157; // OK
CRunSurface.ACT_DRAW_ELLIPSE_WITH_COLOR = 158; // OK
CRunSurface.ACT_DRAW_RECTANGLE_WITH_COLOR = 159; // OK
CRunSurface.ACT_DRAW_POLYGON_WITH_COLOR = 160; // OK
CRunSurface.ACT_APPLY_COLOR_MATRIX = 161; // OK
CRunSurface.ACT_STORE_IMAGE = 162; // OK
CRunSurface.ACT_RESTORE_IMAGE = 163; // OK
CRunSurface.ACT_APPLY_BRIGHTNESS = 164; // OK
CRunSurface.ACT_APPLY_CONTRAST = 165; // OK
CRunSurface.ACT_DRAW_RECTANGLE_WITH_SIZE_AND_COLOR = 166; // OK
CRunSurface.ACT_DRAW_ELLIPSE_WITH_SIZE_AND_COLOR = 167; // OK
CRunSurface.ACT_SET_BLIT_ALPHA = 168; // OK
CRunSurface.ACT_PUSH_BLIT_SETTINGS = 169; // OK
CRunSurface.ACT_POP_BLIT_SETTINGS = 170; // OK
CRunSurface.ACT_ENABLE_BLIT_ALPHA_COMPOSITION = 171; // OK
CRunSurface.ACT_DISABLE_BLIT_ALPHA_COMPOSITION = 172; // OK
CRunSurface.ACT_ENABLE_BLIT_ALPHA_TRANSPARENCY = 173; // OK
CRunSurface.ACT_DISABLE_BLIT_ALPHA_TRANSPARENCY = 174; // OK

CRunSurface.EXP_IMAGE_COUNT = 0; // OK
CRunSurface.EXP_SEL_IMAGE = 1; // OK
CRunSurface.EXP_DISPLAY_IMAGE = 2; // OK
CRunSurface.EXP_RGB_AT = 3; // OK
CRunSurface.EXP_WIDTH = 4; // OK
CRunSurface.EXP_HEIGHT = 5; // OK
CRunSurface.EXP_LAST_IMAGE = 6; // OK
CRunSurface.EXP_EXPORTED_OVL_ADDRESS = 7; // NOT POSSIBLE
CRunSurface.EXP_DISPLAY_WIDTH = 8; // OK
CRunSurface.EXP_DISPLAY_HEIGHT = 9; // OK
CRunSurface.EXP_RED_AT = 10; // OK
CRunSurface.EXP_GREEN_AT = 11; // OK
CRunSurface.EXP_BLUE_AT = 12; // OK
CRunSurface.EXP_ALPHA_AT = 13; // OK
CRunSurface.EXP_IMG_RGB_AT = 14; // OK
CRunSurface.EXP_IMG_WIDTH = 15; // OK
CRunSurface.EXP_IMG_HEIGHT = 16; // OK
CRunSurface.EXP_CALLBACK_X = 17;  // OK
CRunSurface.EXP_CALLBACK_Y = 18;  // OK
CRunSurface.EXP_CALLBACK_AREA_X1 = 19; // OK
CRunSurface.EXP_CALLBACK_AREA_Y1 = 20; // OK
CRunSurface.EXP_CALLBACK_AREA_X2 = 21; // OK
CRunSurface.EXP_CALLBACK_AREA_Y2 = 22; // OK
CRunSurface.EXP_RGB = 23; // OK
CRunSurface.EXP_BLEND = 24; // OK
CRunSurface.EXP_INVERT = 25; // OK
CRunSurface.EXP_MULTIPLY = 26; // OK
CRunSurface.EXP_TRANSP_COLOR = 27; // OK
CRunSurface.EXP_FILTER_COUNT = 28; // NOT IMPLEMENTED
CRunSurface.EXP_FILTER = 29; // NOT IMPLEMENTED
CRunSurface.EXP_FILTER_EXT = 30; // NOT IMPLEMENTED
CRunSurface.EXP_FILTER_EXT_COUNT = 31; // NOT IMPLEMENTED
CRunSurface.EXP_FILTER_CAN_SAVE = 32; // NOT IMPLEMENTED
CRunSurface.EXP_BUFFER_ADDR = 33; // NOT POSSIBLE
CRunSurface.EXP_BUFFER_PITCH = 34; // NOT POSSIBLE
CRunSurface.EXP_FILTER_ALL_EXTS = 35;
CRunSurface.EXP_FLOOD_X1 = 36; // OK
CRunSurface.EXP_FLOOD_Y1 = 37; // OK
CRunSurface.EXP_FLOOD_X2 = 38; // OK
CRunSurface.EXP_FLOOD_Y2 = 39; // OK
CRunSurface.EXP_PATTERN = 40; // OK
CRunSurface.EXP_PATTERN_COUNT = 41; // OK
CRunSurface.EXP_PATTERN_COLOR = 42; // OK
CRunSurface.EXP_PATTERN_COLOR_A = 43; // OK
CRunSurface.EXP_PATTERN_COLOR_B = 44; // OK
CRunSurface.EXP_PATTERN_IMAGE = 45; // OK
CRunSurface.EXP_IMG_RED_AT = 46; // OK
CRunSurface.EXP_IMG_GREEN_AT = 47; // OK
CRunSurface.EXP_IMG_BLUE_AT = 48; // OK
CRunSurface.EXP_IMG_ALPHA_AT = 49; // OK
CRunSurface.EXP_HEX_TO_RGB = 50; // OK
CRunSurface.EXP_RANDOM_COLOR = 51; // OK
CRunSurface.EXP_SEL_IMG_REF = 52; // NOT POSSIBLE
CRunSurface.EXP_IMG_REF = 53; // NOT POSSIBLE
CRunSurface.EXP_CALLBACK_SRC_COL = 54; // OK
CRunSurface.EXP_CALLBACK_DEST_COL = 55; // OK
CRunSurface.EXP_OBJ_IMG_REF = 56; // NOT POSSIBLE
CRunSurface.EXP_BG_IMG_REF = 57; // NOT POSSIBLE
CRunSurface.EXP_CALLBACK_SRC_ALPHA = 58; // OK
CRunSurface.EXP_FRAME_WINDOW_HANDLE = 59; // NOT POSSIBLE
CRunSurface.EXP_IMG_HOT_X = 60; // OK
CRunSurface.EXP_IMG_HOT_Y = 61; // OK
CRunSurface.EXP_HOT_X = 62; // OK
CRunSurface.EXP_HOT_Y = 63; // OK
CRunSurface.EXP_IMG_TRANSP_COLOR = 64; // OK 
CRunSurface.EXP_CALLBACK_DEST_ALPHA = 65; // OK
CRunSurface.EXP_ADD = 66; // OK
CRunSurface.EXP_SUBSTRACT = 67; // OK
CRunSurface.EXP_TRANSFORMED_SURFACE_ADDR = 68; // NOT POSSIBLE
CRunSurface.EXP_X_SCALE = 69; // OK
CRunSurface.EXP_Y_SCALE = 70; // OK
CRunSurface.EXP_ANGLE = 71; // OK
CRunSurface.EXP_SCREEN_TO_IMG_X = 72;
CRunSurface.EXP_SCREEN_TO_IMG_Y = 73;
CRunSurface.EXP_PATTERN_TYPE = 74; // NOT IMPLEMENTED
CRunSurface.EXP_COMPOSED_COLOR = 75; // OK
CRunSurface.EXP_COMPOSED_ALPHA = 76; // OK

// Constructor of the object.
// ----------------------------------------------------------------
function CRunSurface() {
    this.oSurf = new OSurface;
    this.canvas = document.createElement("canvas");
    this.context = this.canvas.getContext("2d");
    this.flipHorizontaly = false;
    this.flipVerticaly = false;
    this.loadFirstImageOnStart = false;
    this.fileIOinProgress = false;
    this.appContext = null;
}

// Prototype definition
// -----------------------------------------------------------------
CRunSurface.prototype = CServices.extend(new CRunExtension(),
    {
        // Returns the number of conditions
        // --------------------------------------------------------------------
        // Warning, if this number is not correct, the application _will_ crash
        getNumberOfCondition: function () {
            return CRunSurface.CND_LAST;
        },                                              // Don't forget the comma between each function

        // Creation of the object
        // --------------------------------------------------------------------
        createRunObject: function (file, cob, version) {
            this.oSurf.setW(file.readAShort());
            this.oSurf.setH(file.readAShort());
            this.ho.hoImgWidth = this.oSurf.w;
            this.ho.hoImgHeight = this.oSurf.h;
            /***************************************
                WORKAROUND FOR COLLISION : NOT RECOMMANDED BY YVES
            ****************************************/
            //this.ho.hoType = COI.OBJ_SPR;
            this.oSurf.w_def = file.readAShort();
            this.oSurf.h_def = file.readAShort();

            var imageList = new Array(this.oSurf.MAX_IMAGES);
            var n;
            for (n = 0; n < this.oSurf.MAX_IMAGES; n++) {
                var index = file.readAShort();
                if (index > 0) {
                    imageList[n] = index;
                }
            }

            this.oSurf.nImages = file.readAShort();
            this.oSurf.imageList = new Array(this.oSurf.nImages);
            var imageHandles = [];

            for (n = 0; n < this.oSurf.nImages; n++) {
                this.oSurf.imageList[n] = new OSurfaceImage();
                this.oSurf.imageList[n].imageHandle = imageList[n];
                imageHandles[n] = this.oSurf.imageList[n].imageHandle;
            }

            if (this.oSurf.imageList.length == 0) {
                this.oSurf.nImages = 1;
                var surf = new OSurfaceImage();
                surf.w = this.oSurf.w;
                surf.h = this.oSurf.h;
                this.oSurf.imageList[0] = surf;
            }

            // Extension canvas
            this.canvas.width = this.oSurf.w;
            this.canvas.height = this.oSurf.h;

            if (this.oSurf.nImages > 0) {
                this.ho.loadImageList(imageHandles);
                this.oSurf.currentImage = 0;
                this.oSurf.selectedImage = 0;
                this.ho.roc.rcImage = this.oSurf.currentImage;
            } else {
                this.oSurf.selectedImage = -1;
                this.oSurf.currentImage = -1;
            }

            this.oSurf.x = cob.cobX;
            this.oSurf.y = cob.cobY;

            this.oSurf.globalContext = this.context;

            this.oSurf.extensionObject = this;

            this.loadFirstImageOnStart = file.readAByte() == 1;
            this.oSurf.useAbsoluteCoordinates = file.readAByte() == 1;
            this.oSurf.threadedIO = file.readAByte() == 1;
            this.oSurf.keepPoints = file.readAByte() == 1;
            this.oSurf.multiImg = file.readAByte() == 1;
            this.oSurf.dispTarget = file.readAByte() == 1;
            this.oSurf.selectLast = file.readAByte() == 1;

            // Font Text
            file.skipBytes(3); // WHY ? 
            var font = this.ho.hoAdRunHeader.rhApp.bUnicode ? file.readLogFont() : file.readLogFont16();
            this.oSurf.textParams.family = font.lfFaceName;
            this.oSurf.textParams.size = font.lfHeight + "pt";
            this.oSurf.textParams.weigth = font.lfWeight / 100;

            return false;
        },

        // Handling of the object
        // ---------------------------------------------------------------------
        handleRunObject: function () {
            if (this.loadFirstImageOnStart) {
                this.oSurf.setSelectedImage(0);
                this.oSurf.setCurrentImage(0);
                this.oSurf.redraw();
            }

            return CRunExtension.REFLAG_ONESHOT;
        },

        // Displays the object
        // ----------------------------------------------------------------
        displayRunObject: function (renderer, xDraw, yDraw) {
            if (this.appContext == null) {
                this.appContext = renderer._context;
            }
            // Example of display of an image, taking the layer and frame position
            // into account
            var x = this.ho.hoX - this.rh.rhWindowX + this.ho.pLayer.x + xDraw;
            var y = this.ho.hoY - this.rh.rhWindowY + this.ho.pLayer.y + yDraw;
            var w = this.oSurf.w;
            var h = this.oSurf.h;

            // Transparent
            this.oSurf.redrawTransparentColor(0, 0, this.oSurf.imageList[this.oSurf.currentImage].getWidth(), this.oSurf.imageList[this.oSurf.currentImage].getHeight());

            if (typeof (this.oSurf.imageList[this.oSurf.currentImage]) != "undefined") {
                renderer._context.save();
                this.oSurf.imageList[this.oSurf.currentImage].context.save();
                let hotX = this.oSurf.imageList[this.oSurf.currentImage].hotSpot.x;
                let hotY = this.oSurf.imageList[this.oSurf.currentImage].hotSpot.y;
                //renderer._context.translate(-hotX, -hotY);

                if (this.oSurf.imageList[this.oSurf.currentImage].xScale != 0 || this.oSurf.imageList[this.oSurf.currentImage].yScale != 0) {

                    let percentX = (this.oSurf.imageList[this.oSurf.currentImage].hotSpot.x * 100) / w;
                    let percentY = (this.oSurf.imageList[this.oSurf.currentImage].hotSpot.y * 100) / h;
                    w *= this.oSurf.imageList[this.oSurf.currentImage].xScale;
                    h *= this.oSurf.imageList[this.oSurf.currentImage].yScale;

                    x -= Math.ceil((percentX * w) / 100);
                    y -= Math.ceil((percentY * h) / 100);



                    renderer._context["mozImageSmoothingEnabled"] = this.oSurf.imageList[this.oSurf.currentImage].smoothScale;
                    renderer._context["webkitImageSmoothingEnabled"] = this.oSurf.imageList[this.oSurf.currentImage].smoothScale;
                    renderer._context["msImageSmoothingEnabled"] = this.oSurf.imageList[this.oSurf.currentImage].smoothScale;
                    renderer._context["imageSmoothingEnabled"] = this.oSurf.imageList[this.oSurf.currentImage].smoothScale;
                }

                if (this.oSurf.imageList[this.oSurf.currentImage].rotation != 0) {

                    let tx = 0; //-((this.oSurf.imageList[this.oSurf.currentImage].getWidth()) / 2) - x - 4;
                    let ty = 0;
                    tx = x;
                    ty = y;
                    //renderer._context.translate(tx, 140);
                    renderer._context.translate(tx, ty);
                    let rads = this.oSurf.imageList[this.oSurf.currentImage].rotation * Math.PI / 180;
                    renderer._context.rotate(-rads);
                    x -= tx;
                    y -= ty;
                }

                renderer.renderSimpleImage(
                    this.oSurf.imageList[this.oSurf.currentImage].canvas,
                    x,
                    y,
                    w,
                    h,
                    0,
                    0
                );
                renderer._context.restore();
                this.oSurf.imageList[this.oSurf.currentImage].context.restore();
            }

        },

        getParamColour(act, val) {
            return act.getParamColour(this.rh, val);
        },

        // Condition entry
        // -----------------------------------------------------------------
        condition: function (num, cnd) {
            switch (num) {
                case CRunSurface.CND_HAS_ALPHA:
                    return this.oSurf.hasAlpha(this.oSurf.selectedImage);

                case CRunSurface.CND_RGB_AT:
                    var x = cnd.getParamExpression(this.rh, 0);
                    var y = cnd.getParamExpression(this.rh, 1);
                    var color = cnd.getParamExpression(this.rh, 2);
                    return this.oSurf.getRGBAt(this.oSurf.selectedImage, x, y) == color;

                case CRunSurface.CND_PATTERN_EXIST:
                    var name = cnd.getParamExpString(this.rh, 0);

                    return this.oSurf.hasPattern(name);

                case CRunSurface.CND_RED_AT:
                    var x = cnd.getParamExpression(this.rh, 0);
                    var y = cnd.getParamExpression(this.rh, 1);
                    var color = cnd.getParamExpression(this.rh, 2);
                    return this.oSurf.getRed(this.oSurf.selectedImage, x, y) == color;

                case CRunSurface.CND_GREEN_AT:
                    var x = cnd.getParamExpression(this.rh, 0);
                    var y = cnd.getParamExpression(this.rh, 1);
                    var color = cnd.getParamExpression(this.rh, 2);
                    return this.oSurf.getGreen(this.oSurf.selectedImage, x, y) == color;

                case CRunSurface.CND_BLUE_AT:
                    var x = cnd.getParamExpression(this.rh, 0);
                    var y = cnd.getParamExpression(this.rh, 1);
                    var color = cnd.getParamExpression(this.rh, 2);
                    return this.oSurf.getBlue(this.oSurf.selectedImage, x, y) == color;

                case CRunSurface.CND_FILE_IS_BEHIND_LOADED:
                    return this.oSurf.imageList[this.oSurf.selectedImage].fileLoaded;

                case CRunSurface.CND_ON_LOADING_SUCCEEDED:
                    return true;

                case CRunSurface.CND_ON_LOADING_FAILED:
                    return true;

                case CRunSurface.CND_DISPLAYED_IMAGE:
                    var index = cnd.getParamExpression(this.rh, 0);
                    return this.oSurf.currentImage == index;

                case CRunSurface.CND_SELECTED_IMAGE:
                    var index = cnd.getParamExpression(this.rh, 0);
                    return this.oSurf.selectedImage == index;

                case CRunSurface.CND_SELECT_IMAGE:
                    var index = cnd.getParamExpression(this.rh, 0);
                    this.oSurf.setSelectedImage(index);
                    if (this.oSurf.currentImage == index) {
                        this.oSurf.redraw();
                    }
                    return true;

                case CRunSurface.CND_IS_INSIDE_IMAGE:
                    var x = cnd.getParamExpression(this.rh, 0);
                    var y = cnd.getParamExpression(this.rh, 1);

                    return (x > 0 && y > 0 && x < this.oSurf.w && y < this.oSurf.h);

                case CRunSurface.CND_ON_CALLBACK:
                    var name = cnd.getParamExpString(this.rh, 0);
                    var actionName = this.rh.rhEvtProg.rhCurParam0;
                    return name == actionName;

                case CRunSurface.CND_FILE_IO_IS_IN_PROGRESS:
                    return this.oSurf.fileIOinProgress;


            }

            return false;
        },

        // Action entry
        // --------------------------------------------------------------
        action: function (num, act) {
            switch (num) {
                case CRunSurface.ACT_CREATE_ALPHA_CHANNEL:
                    this.oSurf.imageList[this.oSurf.selectedImage].hasAlphaChannel = true;
                    break;
                case CRunSurface.ACT_FORCE_REDRAW:
                    this.oSurf.skipRedraw = false;
                    this.oSurf.redraw();
                    break;

                case CRunSurface.ACT_SET_DISPLAY_SELECTED_IMAGE:
                    var val = act.getParamExpression(this.rh, 0);
                    this.oSurf.dispTarget = val == 1;
                    break;

                case CRunSurface.ACT_SET_USE_ABSOLUTE_COORDS:
                    var val = act.getParamExpression(this.rh, 0);
                    this.oSurf.useAbsoluteCoordinates = val == 1;
                    break;

                case CRunSurface.ACT_SET_KEEP_POINTS_AFTER_DRAWING:
                    var val = act.getParamExpression(this.rh, 0);
                    this.oSurf.keepPoints = val == 1;
                    break;

                case CRunSurface.CND_FILE_IO_IS_IN_PROGRESS:
                    return this.oSurf.fileIOinProgress;

                case CRunSurface.ACT_DELETE_IMAGE:
                    var index = act.getParamExpression(this.rh, 0);
                    this.TargetImage.deleteImage(index);
                    break;

                case CRunSurface.ACT_INSERT_IMAGE:
                    var index = act.getParamExpression(this.rh, 0);
                    var w = act.getParamExpression(this.rh, 1);
                    var h = act.getParamExpression(this.rh, 2);
                    this.oSurf.insertImageAt(index, w, h);
                    break;

                case CRunSurface.ACT_ADD_IMAGE:
                    var w = act.getParamExpression(this.rh, 0);
                    var h = act.getParamExpression(this.rh, 1);
                    this.oSurf.insertImageAt(this.oSurf.imageList.length, w, h);

                    break;

                case CRunSurface.ACT_DELETE_ALL_IMAGES:
                    this.oSurf.deleteAllImages();

                    break;

                case CRunSurface.ACT_SET_TRANSPARENT_COLOR:
                    var color = this.getParamColour(act, 0);
                    var replace = act.getParamExpression(this.rh, 1);
                    this.oSurf.setTransparentColor(this.oSurf.selectedImage, CServices.getColorString(color), replace == 1);
                    break;

                case CRunSurface.ACT_SET_TRANSPARENT:
                    var transparent = act.getParamExpression(this.rh, 0);
                    this.oSurf.setTransparent(transparent == 1)
                    break;

                case CRunSurface.ACT_CLEAR_WITH_COLOR:
                    var color = this.getParamColour(act, 0);
                    this.oSurf.clearWithColor(CServices.getColorString(color));

                    break;

                case CRunSurface.ACT_CLEAR_ALPHA_WITH:
                    var alpha = act.getParamExpression(this.rh, 0);
                    this.oSurf.clearWithAlpha(alpha);

                    break;

                case CRunSurface.ACT_CLEAR_WITH_PATTERN:
                    var pattern = act.getParamExpString(this.rh, 0);
                    this.oSurf.drawRect(0, 0, this.oSurf.w, this.oSurf.h, pattern);

                    break;

                case CRunSurface.ACT_SET_PIXEL_AT:
                    var x = act.getParamExpression(this.rh, 0);
                    var y = act.getParamExpression(this.rh, 1);
                    var color = this.getParamColour(act, 2);

                    this.oSurf.drawRect(x, y, 1, 1, CServices.getColorString(color));

                    break;

                case CRunSurface.ACT_REPLACE:
                    var oldColor = this.getParamColour(act, 0);
                    var newColor = this.getParamColour(act, 1);
                    this.oSurf.replaceColor(this.TargetImage.selectedImage, oldColor, newColor);

                    break;

                case CRunSurface.ACT_DRAW_LINE:
                    var x1 = act.getParamExpression(this.rh, 0);
                    var y1 = act.getParamExpression(this.rh, 1);
                    var x2 = act.getParamExpression(this.rh, 2);
                    var y2 = act.getParamExpression(this.rh, 3);
                    var color = this.getParamColour(act, 4);
                    var thickness = act.getParamExpression(this.rh, 5);

                    this.oSurf.drawLine(x1, y1, x2, y2, CServices.getColorString(color), thickness);

                    break;

                case CRunSurface.ACT_DRAW_LINE_WITH_ALPHA:
                    var x1 = act.getParamExpression(this.rh, 0);
                    var y1 = act.getParamExpression(this.rh, 1);
                    var x2 = act.getParamExpression(this.rh, 2);
                    var y2 = act.getParamExpression(this.rh, 3);
                    var alpha = act.getParamExpression(this.rh, 4);

                    this.oSurf.drawHardLine(x1, y1, x2, y2, null, alpha);

                    break;

                case CRunSurface.ACT_DRAW_LINE_WITH_PATTERN:
                    var x1 = act.getParamExpression(this.rh, 0);
                    var y1 = act.getParamExpression(this.rh, 1);
                    var x2 = act.getParamExpression(this.rh, 2);
                    var y2 = act.getParamExpression(this.rh, 3);
                    var patternName = act.getParamExpString(this.rh, 4);
                    var thickness = act.getParamExpression(this.rh, 5);

                    this.oSurf.drawLine(x1, y1, x2, y2, patternName, thickness);

                    break;

                case CRunSurface.ACT_DRAW_RECTANGLE_WITH_ALPHA:
                    var x1 = act.getParamExpression(this.rh, 0);
                    var y1 = act.getParamExpression(this.rh, 1);
                    var x2 = act.getParamExpression(this.rh, 2);
                    var y2 = act.getParamExpression(this.rh, 3);
                    var alpha = act.getParamExpression(this.rh, 4);
                    this.oSurf.drawHardRect(x1, y1, Math.abs(x2 - x1), Math.abs(y2 - y1), null, alpha);
                    break;
                case CRunSurface.ACT_DRAW_RECTANGLE_WITH_COLOR_AND_THICKNESS:
                    var x1 = act.getParamExpression(this.rh, 0);
                    var y1 = act.getParamExpression(this.rh, 1);
                    var x2 = act.getParamExpression(this.rh, 2);
                    var y2 = act.getParamExpression(this.rh, 3);
                    var color = this.getParamColour(act, 4);
                    var thickness = act.getParamExpression(this.rh, 5);
                    var thicknessColor = this.getParamColour(act, 6);

                    var rect = this.oSurf.getRectByBox(x1, y1, x2, y2);

                    this.oSurf.drawRect(rect.x, rect.y, rect.w, rect.h, CServices.getColorString(color), thickness, CServices.getColorString(thicknessColor));

                    break;

                case CRunSurface.ACT_DRAW_RECTANGLE_WITH_COLOR:
                    var x1 = act.getParamExpression(this.rh, 0);
                    var y1 = act.getParamExpression(this.rh, 1);
                    var x2 = act.getParamExpression(this.rh, 2);
                    var y2 = act.getParamExpression(this.rh, 3);
                    var color = this.getParamColour(act, 4);

                    var rect = this.oSurf.getRectByBox(x1, y1, x2, y2);

                    this.oSurf.drawRect(rect.x, rect.y, rect.w, rect.h, CServices.getColorString(color));

                    break;

                case CRunSurface.ACT_DRAW_RECTANGLE_WITH_SIZE_AND_COLOR_OUTLINE:

                    var x = act.getParamExpression(this.rh, 0);
                    var y = act.getParamExpression(this.rh, 1);
                    var w = act.getParamExpression(this.rh, 2);
                    var h = act.getParamExpression(this.rh, 3);
                    var color = this.getParamColour(act, 4);
                    var thickness = act.getParamExpression(this.rh, 5);
                    var thicknessColor = this.getParamColour(act, 6);

                    this.oSurf.drawRect(x, y, w, h, CServices.getColorString(color), thickness, CServices.getColorString(thicknessColor));

                    break;

                case CRunSurface.ACT_DRAW_RECTANGLE_WITH_SIZE_AND_COLOR:

                    var x = act.getParamExpression(this.rh, 0);
                    var y = act.getParamExpression(this.rh, 1);
                    var w = act.getParamExpression(this.rh, 2);
                    var h = act.getParamExpression(this.rh, 3);
                    var color = this.getParamColour(act, 4);

                    this.oSurf.drawRect(x, y, w, h, CServices.getColorString(color));

                    break;

                // ELLIPSE
                case CRunSurface.ACT_DRAW_ELLIPSE:
                    var x1 = act.getParamExpression(this.rh, 0);
                    var y1 = act.getParamExpression(this.rh, 1);
                    var x2 = act.getParamExpression(this.rh, 2);
                    var y2 = act.getParamExpression(this.rh, 3);
                    var color = this.getParamColour(act, 4);
                    var thickness = act.getParamExpression(this.rh, 5);
                    var thicknessColor = this.getParamColour(act, 6);

                    var r = this.oSurf.getRectByBox(x1, y1, x2, y2);
                    var e = this.oSurf.getEllipseByRect(r.x, r.y, r.w, r.h);

                    this.oSurf.drawEllipse(e.xCenter, e.yCenter, e.xRadius, e.yRadius, CServices.getColorString(color), thickness, CServices.getColorString(thicknessColor))

                    break;

                case CRunSurface.ACT_DRAW_ELLIPSE_WITH_COLOR:
                    var x1 = act.getParamExpression(this.rh, 0);
                    var y1 = act.getParamExpression(this.rh, 1);
                    var x2 = act.getParamExpression(this.rh, 2);
                    var y2 = act.getParamExpression(this.rh, 3);
                    var color = this.getParamColour(act, 4);
                    var r = this.oSurf.getRectByBox(x1, y1, x2, y2);
                    var e = this.oSurf.getEllipseByRect(r.x, r.y, r.w, r.h);
                    this.oSurf.drawEllipse(e.xCenter, e.yCenter, e.xRadius, e.yRadius, CServices.getColorString(color));

                    break;

                case CRunSurface.ACT_DRAW_ELLIPSE_WITH_SIZE_AND_COLOR_THICKNESS:
                    var x = act.getParamExpression(this.rh, 0);
                    var y = act.getParamExpression(this.rh, 1);
                    var w = act.getParamExpression(this.rh, 2);
                    var h = act.getParamExpression(this.rh, 3);
                    var color = this.getParamColour(act, 4);
                    var thickness = act.getParamExpression(this.rh, 5);
                    var thicknessColor = this.getParamColour(act, 6);

                    var e = this.oSurf.getEllipseByRect(x, y, w, h);

                    this.oSurf.drawEllipse(e.xCenter, e.yCenter, e.xRadius, e.yRadius, CServices.getColorString(color), thickness, CServices.getColorString(thicknessColor));

                    break;

                case CRunSurface.ACT_DRAW_ELLIPSE_WITH_SIZE_AND_COLOR:
                    var x = act.getParamExpression(this.rh, 0);
                    var y = act.getParamExpression(this.rh, 1);
                    var w = act.getParamExpression(this.rh, 2);
                    var h = act.getParamExpression(this.rh, 3);
                    var color = this.getParamColour(act, 4);

                    var e = this.oSurf.getEllipseByRect(x, y, w, h);

                    this.oSurf.drawEllipse(e.xCenter, e.yCenter, e.xRadius, e.yRadius, CServices.getColorString(color))

                    break;

                // Adjustement
                case CRunSurface.ACT_APPLY_BRIGHTNESS:
                    var val = act.getParamExpDouble(this.rh, 0);
                    this.oSurf.setBrightness(val);

                    break;

                case CRunSurface.ACT_APPLY_CONTRAST:
                    var val = act.getParamExpDouble(this.rh, 0);
                    this.oSurf.setContrast(val);

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
                    this.oSurf.scroll(act.getParamExpression(this.rh, 0), act.getParamExpression(this.rh, 1), act.getParamExpression(this.rh, 2));
                    break;

                case CRunSurface.ACT_SET_HOT_SPOT_TO_PX:
                    var x = act.getParamExpression(this.rh, 0);
                    var y = act.getParamExpression(this.rh, 1);
                    this.oSurf.setHotSpotX(x);
                    this.oSurf.setHotSpotY(y);
                    break;
                case CRunSurface.ACT_SET_HOT_SPOT_TO_PERCENT:
                    var px = act.getParamExpression(this.rh, 0);
                    var py = act.getParamExpression(this.rh, 1);
                    var x = px / 100.0 * this.oSurf.imageList[this.oSurf.selectedImage].getWidth();
                    var y = py / 100.0 * this.oSurf.imageList[this.oSurf.selectedImage].getHeight();
                    this.oSurf.setHotSpotX(x);
                    this.oSurf.setHotSpotY(y);
                    break;

                case CRunSurface.ACT_RESIZE_IMAGE:
                    var w = act.getParamExpression(this.rh, 0);
                    var h = act.getParamExpression(this.rh, 1);
                    this.oSurf.resizeImage(w, h);
                    break;

                case CRunSurface.ACT_ROTATE_IMAGE:
                    var degrees = act.getParamExpression(this.rh, 0);
                    this.oSurf.rotateImage(degrees);
                    break;

                case CRunSurface.ACT_SET_ANGLE:
                    var degrees = act.getParamExpression(this.rh, 0);
                    this.oSurf.setAngle(degrees);
                    break;

                case CRunSurface.ACT_SET_SCALE:
                    var scale = act.getParamExpression(this.rh, 0);
                    var quality = act.getParamExpression(this.rh, 1);
                    this.oSurf.imageList[this.oSurf.selectedImage].xScale = scale;
                    this.oSurf.imageList[this.oSurf.selectedImage].yScale = scale;
                    this.oSurf.imageList[this.oSurf.selectedImage].smoothScale = parseInt(quality) == 1;
                    break;

                case CRunSurface.ACT_SET_X_SCALE:
                    var scale = act.getParamExpression(this.rh, 0);
                    var quality = act.getParamExpression(this.rh, 1);
                    this.oSurf.imageList[this.oSurf.selectedImage].xScale = scale;
                    this.oSurf.imageList[this.oSurf.selectedImage].smoothScale = parseInt(quality) == 1;
                    break;
                case CRunSurface.ACT_SET_Y_SCALE:
                    var scale = act.getParamExpression(this.rh, 0);
                    var quality = act.getParamExpression(this.rh, 1);
                    this.oSurf.imageList[this.oSurf.selectedImage].yScale = scale;
                    this.oSurf.imageList[this.oSurf.selectedImage].smoothScale = parseInt(quality) == 1;
                    break;

                case CRunSurface.ACT_SELECT_IMAGE:
                    var imageIndex = act.getParamExpression(this.rh, 0);
                    this.oSurf.setSelectedImage(imageIndex);

                    break;

                case CRunSurface.ACT_DISPLAY_IMAGE:
                    var imageIndex = act.getParamExpression(this.rh, 0);
                    this.oSurf.setCurrentImage(imageIndex);

                    break;

                case CRunSurface.ACT_COPY_IMAGE:
                    var destinationIndex = act.getParamExpression(this.rh, 0);
                    var sourceImage = act.getParamExpression(this.rh, 1);
                    this.oSurf.copyImage(destinationIndex, sourceImage);
                    break;

                case CRunSurface.ACT_COPY_IMAGE_FROM_IMAGE_SURFACE:
                    var destinationIndex = act.getParamExpression(this.rh, 0);
                    var obj = act.getParamObject(this.rh, 1);
                    var sourceImage = act.getParamExpression(this.rh, 2);
                    var surf = obj.ext.oSurf;
                    if (typeof surf != "undefined" && surf.hasImageIndex(sourceImage)) {
                        surf.loadBankImage(sourceImage);
                        this.oSurf.copyImageFromCanvas(destinationIndex, surf.imageList[sourceImage].canvas);
                    }
                    break;

                case CRunSurface.ACT_SET_ALPHA_AT:
                    var x = act.getParamExpression(this.rh, 0);
                    var y = act.getParamExpression(this.rh, 1);
                    var value = act.getParamExpression(this.rh, 2);
                    this.oSurf.setAlpha(this.oSurf.selectedImage, x, y, value);
                    break;

                case CRunSurface.ACT_SWAP_IMAGES:
                    var img1 = act.getParamExpression(this.rh, 0);
                    var img2 = act.getParamExpression(this.rh, 1);
                    this.oSurf.swapImages(img1, img2);
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

                // PATTERN
                case CRunSurface.ACT_CREATE_TILED_IMAGE_PATTERN:
                    var name = act.getParamExpString(this.rh, 0);
                    var image = act.getParamExpression(this.rh, 1);
                    var offsetX = act.getParamExpression(this.rh, 2);
                    var offsetY = act.getParamExpression(this.rh, 3);

                    this.oSurf.createTiledImagePattern(name, image, offsetX, offsetY);
                    break;

                case CRunSurface.ACT_CREATE_LINEAR_GRADIENT_PATTERN:
                    var name = act.getParamExpString(this.rh, 0);
                    var colorA = this.getParamColour(act, 1);
                    var colorB = this.getParamColour(act, 2);
                    var vertical = act.getParamExpression(this.rh, 3);

                    this.oSurf.createLinearGradientPattern(name, CServices.getColorString(colorA), CServices.getColorString(colorB), vertical);

                    break;

                case CRunSurface.ACT_CREATE_RADIAL_GRADIENT_PATTERN:
                    var name = act.getParamExpString(this.rh, 0);
                    var colorA = this.getParamColour(act, 1);
                    var colorB = this.getParamColour(act, 2);
                    this.oSurf.createRadialGradientPattern(name, CServices.getColorString(colorA), CServices.getColorString(colorB));

                    break;

                case CRunSurface.ACT_CREATE_COLOR_PATTERN:
                    var name = act.getParamExpString(this.rh, 0);
                    var color = this.getParamColour(act, 1);
                    this.oSurf.createColorPattern(name, CServices.getColorString(color));

                    break;

                case CRunSurface.ACT_CREATE_CALLBACK_PATTERN:
                    var name = act.getParamExpString(this.rh, 0);
                    this.oSurf.createCallbackPattern(name);
                    break;

                case CRunSurface.ACT_DRAW_RECTANGLE_WITH_SIZE_AND_PATTERN:
                    var x = act.getParamExpression(this.rh, 0);
                    var y = act.getParamExpression(this.rh, 1);
                    var w = act.getParamExpression(this.rh, 2);
                    var h = act.getParamExpression(this.rh, 3);
                    var patternName = act.getParamExpString(this.rh, 4);
                    var thickness = act.getParamExpression(this.rh, 5);
                    var thicknessPatternName = act.getParamExpString(this.rh, 6);

                    this.oSurf.drawRect(x, y, w, h, patternName, thickness, thicknessPatternName);

                    break;

                case CRunSurface.ACT_DRAW_RECTANGLE_WITH_FILL_PATTERN:
                    var x1 = act.getParamExpression(this.rh, 0);
                    var y1 = act.getParamExpression(this.rh, 1);
                    var x2 = act.getParamExpression(this.rh, 2);
                    var y2 = act.getParamExpression(this.rh, 3);
                    var patternName = act.getParamExpString(this.rh, 4);
                    var thickness = act.getParamExpression(this.rh, 5);
                    var thicknessPatternName = act.getParamExpString(this.rh, 6);

                    var rect = this.oSurf.getRectByBox(x1, y1, x2, y2);

                    this.oSurf.drawRect(rect.x, rect.y, rect.w, rect.h, patternName, thickness, thicknessPatternName);
                    break;

                case CRunSurface.ACT_DRAW_ELLIPSE_WITH_SIZE_AND_PATTERN:
                    var x = act.getParamExpression(this.rh, 0);
                    var y = act.getParamExpression(this.rh, 1);
                    var w = act.getParamExpression(this.rh, 2);
                    var h = act.getParamExpression(this.rh, 3);
                    var patternName = act.getParamExpString(this.rh, 4);
                    var thickness = act.getParamExpression(this.rh, 5);
                    var thicknessPatternName = act.getParamExpString(this.rh, 6);
                    var e = this.oSurf.getEllipseByRect(x, y, w, h);
                    this.oSurf.drawEllipse(e.xCenter, e.yCenter, e.xRadius, e.yRadius, patternName, thickness, thicknessPatternName);

                    break;

                case CRunSurface.ACT_DRAW_ELLIPSE_WITH_PATTERN:
                    var x1 = act.getParamExpression(this.rh, 0);
                    var y1 = act.getParamExpression(this.rh, 1);
                    var x2 = act.getParamExpression(this.rh, 2);
                    var y2 = act.getParamExpression(this.rh, 3);
                    var patternName = act.getParamExpString(this.rh, 4);
                    var thickness = act.getParamExpression(this.rh, 5);
                    var thicknessPatternName = act.getParamExpString(this.rh, 6);

                    var r = this.oSurf.getRectByBox(x1, y1, x2, y2);

                    var e = this.oSurf.getEllipseByRect(r.x, r.y, r.w, r.h);
                    this.oSurf.drawEllipse(e.xCenter, e.yCenter, e.xRadius, e.yRadius, patternName, thickness, thicknessPatternName);
                    break;

                case CRunSurface.ACT_SET_COLOR_OF_PATTERN:
                    var name = act.getParamExpString(this.rh, 0);
                    var color = this.getParamColour(act, 1);
                    this.oSurf.setColorOfPattern(name, CServices.getColorString(color));
                    break;

                case CRunSurface.ACT_SET_COLORS_OF_PATTERN:
                    var name = act.getParamExpString(this.rh, 0);
                    var colorA = this.getParamColour(act, 1);
                    var colorB = this.getParamColour(act, 2);
                    this.oSurf.setColorOfPattern(name, CServices.getColorString(colorA), CServices.getColorString(colorB));
                    break;

                case CRunSurface.ACT_SET_VERTICAL_FLAG_OF_PATTERN:
                    var name = act.getParamExpString(this.rh, 0);
                    var vertical = act.getParamExpression(this.rh, 1);
                    this.oSurf.setVerticalFlagOfPattern(name, vertical);
                    break;

                case CRunSurface.ACT_SET_ORIGIN_OF_PATTERN:
                    this.oSurf.setOriginOfPattern(act.getParamExpString(this.rh, 0), act.getParamExpression(this.rh, 1), act.getParamExpression(this.rh, 2));
                    break;

                case CRunSurface.ACT_SET_IMAGE_OF_PATTERN:
                    this.oSurf.setImageOfPattern(act.getParamExpString(this.rh, 0), act.getParamExpression(this.rh, 1));
                    break;

                case CRunSurface.ACT_DELETE_PATTERN:
                    var name = act.getParamExpString(this.rh, 0);
                    this.oSurf.deletePattern(name);
                    break;

                // BLIT
                case CRunSurface.ACT_SET_BLIT_REGION_FLAG:
                    this.oSurf.setBlitSourceRegionflag(act.getParamExpression(this.rh, 0) == 1);
                    break;

                case CRunSurface.ACT_SET_BLIT_DESTINATION_POSITION:
                    this.oSurf.setBlitDestinationPosition(act.getParamExpression(this.rh, 0), act.getParamExpression(this.rh, 1));
                    break;

                case CRunSurface.ACT_SET_BLIT_DESTINATION_DIMENSIONS:
                    this.oSurf.setBlitDestinationDimension(act.getParamExpression(this.rh, 0), act.getParamExpression(this.rh, 1));
                    break;

                case CRunSurface.ACT_SET_BLIT_SOURCE_POSITION:
                    this.oSurf.setBlitSourcePosition(act.getParamExpression(this.rh, 0), act.getParamExpression(this.rh, 1));
                    break;

                case CRunSurface.ACT_SET_BLIT_SOURCE_DIMENSIONS:
                    this.oSurf.setBlitSourceDimension(act.getParamExpression(this.rh, 0), act.getParamExpression(this.rh, 1));
                    break;

                case CRunSurface.ACT_SET_BLIT_STRETCH_MODE:
                    this.oSurf.blit.stretchMode = act.getParamExpression(this.rh, 0);
                    break;

                case CRunSurface.ACT_BLIT_IMAGE:
                    var image = act.getParamExpression(this.rh, 0);
                    if (this.oSurf.hasImageIndex(image)) {
                        this.oSurf.loadBankImage(image);
                        this.oSurf.blitImage(image);
                    }
                    break;

                case CRunSurface.ACT_BLIT_IMAGE_ALPHA_CHANNEL_ONTO_ALPHA_CHANNEL:
                    var index = act.getParamExpression(this.rh, 0);
                    if (this.oSurf.hasImageIndex(index) && this.oSurf.hasAlpha(index) && this.oSurf.hasAlpha()) {
                        this.oSurf.loadBankImage(image);
                        this.oSurf.execBlit(this.oSurf.imageList[this.oSurf.selectedImage].canvas, this.oSurf.imageList[index].context);
                    }
                    break;

                case CRunSurface.ACT_BLIT_ONTO_IMAGE:
                    var image = act.getParamExpression(this.rh, 0);
                    if (this.oSurf.hasImageIndex(image)) {
                        this.oSurf.loadBankImage(image);
                        this.oSurf.blitOntoImage(image, false);
                    }
                    break;

                case CRunSurface.ACT_BLIT_ALPHA_CHANNEL_ONTO_IMAGE:
                    var image = act.getParamExpression(this.rh, 0);
                    if (this.oSurf.hasImageIndex(image)) {
                        this.oSurf.loadBankImage(image);
                        this.oSurf.blitOntoImage(image, true);
                    }
                    break;

                case CRunSurface.ACT_BLIT_ALPHA_CHANNEL:
                    var image = act.getParamExpression(this.rh, 0);
                    if (this.oSurf.hasImageIndex(image)) {
                        this.oSurf.loadBankImage(image);
                        this.oSurf.execBlit(
                            this.oSurf.imageList[this.oSurf.selectedImage].canvas,
                            this.oSurf.imageList[image].context,
                            true
                        );
                    }
                    break;

                case CRunSurface.ACT_BLIT_IMAGE_OF_SURFACE:
                    var obj = act.getParamObject(this.rh, 0);
                    var image = act.getParamExpression(this.rh, 1);
                    var surf = obj.ext.oSurf;
                    if (typeof surf != "undefined" && surf.hasImageIndex(image)) {
                        surf.loadBankImage(image);
                        this.oSurf.execBlit(surf.imageList[image].canvas, this.oSurf.imageList[this.oSurf.selectedImage].context);
                    }

                    break;

                case CRunSurface.ACT_BLIT_ONTO_IMAGE_OF_SURFACE:
                    var obj = act.getParamObject(this.rh, 0);
                    var image = act.getParamExpression(this.rh, 1);
                    var surf = obj.ext.oSurf;
                    if (typeof surf != "undefined" && surf.hasImageIndex(image)) {
                        surf.loadBankImage(image);
                        this.oSurf.execBlit(this.oSurf.imageList[this.oSurf.selectedImage].canvas, surf.imageList[image].context);
                    }
                    break;

                case CRunSurface.ACT_SET_BLIT_SEMI_TRANSPARENCY:
                case CRunSurface.ACT_SET_BLIT_ALPHA:
                    this.oSurf.blit.alpha = Math.max(0, Math.min(255, act.getParamExpression(this.rh, 0)));
                    break;

                case CRunSurface.ACT_SET_BLIT_TRANSPARENCY:
                    this.oSurf.blit.useTransparency = act.getParamExpression(this.rh, 0) == 1;
                    break;

                case CRunSurface.ACT_SET_BLIT_TINT:
                    this.oSurf.blit.tint = this.getParamColour(act, 0);
                    break;

                case CRunSurface.ACT_BLIT_ACTIVE_OBJECT:
                    var obj = act.getParamObject(this.rh, 0);
                    if (obj == null) return;
                    var image = obj.roc.rcImage;
                    this.oSurf.blitImageHandle(image);
                    break;

                case CRunSurface.ACT_BLIT_ACTIVE_OBJECT_AT_POSITION:
                    var obj = act.getParamObject(this.rh, 0);
                    if (obj == null) return;
                    var image = obj.roc.rcImage;
                    this.oSurf.setBlitDestinationPosition(obj.hoX - obj.hoImgXSpot, obj.hoY - obj.hoImgYSpot);
                    this.oSurf.setBlitSourcePosition(0, 0);
                    this.oSurf.setBlitDestinationDimension(obj.hoImgWidth, obj.hoImgHeight);
                    this.oSurf.setBlitSourceDimension(obj.hoImgWidth, obj.hoImgHeight);
                    this.oSurf.blitImageHandle(image);
                    break;

                case CRunSurface.ACT_SET_BLIT_SOURCE:
                    var x = act.getParamExpression(this.rh, 0);
                    var y = act.getParamExpression(this.rh, 1);
                    var w = act.getParamExpression(this.rh, 2);
                    var h = act.getParamExpression(this.rh, 3);
                    var flag = act.getParamExpression(this.rh, 4);
                    this.oSurf.setBlitSourcePosition(x, y);
                    this.oSurf.setBlitSourceDimension(w, h);
                    this.oSurf.setBlitSourceRegionflag(flag == 1);
                    break;

                case CRunSurface.ACT_SET_BLIT_DESTINATION:
                    var x = act.getParamExpression(this.rh, 0);
                    var y = act.getParamExpression(this.rh, 1);
                    var w = act.getParamExpression(this.rh, 2);
                    var h = act.getParamExpression(this.rh, 3);
                    var stretchMode = act.getParamExpression(this.rh, 4);
                    this.oSurf.setBlitDestinationPosition(x, y);
                    this.oSurf.setBlitDestinationDimension(w, h);
                    break;

                case CRunSurface.ACT_SET_BLIT_HOT_SPOT:
                    var x = act.getParamExpression(this.rh, 0);
                    var y = act.getParamExpression(this.rh, 1);
                    this.oSurf.blit.xHotSpot = x;
                    this.oSurf.blit.yHotSpot = y;
                    this.oSurf.blit.hotSpotMode &= ~2;
                    break;

                case CRunSurface.ACT_SET_BLIT_HOT_SPOT_FLAG:
                    var flag = act.getParamExpression(this.rh, 0);
                    this.oSurf.blit.useHotSpot |= flag != 0 ? 1 : 0;
                    break;

                case CRunSurface.ACT_SET_BLIT_HOT_SPOT_PERCENT:
                    var x = act.getParamExpression(this.rh, 0);
                    var y = act.getParamExpression(this.rh, 1);
                    this.oSurf.blit.xHotSpot = x;
                    this.oSurf.blit.yHotSpot = y;
                    this.oSurf.blit.hotSpotMode |= 2;
                    break;

                case CRunSurface.ACT_SET_BLIT_ANGLE:
                    var angle = act.getParamExpression(this.rh, 0);
                    this.oSurf.blit.angle = angle % 360;
                    break;

                case CRunSurface.ACT_BLIT_INTO_IMAGE:
                    var image = act.getParamExpression(this.rh, 0);
                    if (this.oSurf.hasImageIndex(image)) {
                        this.oSurf.loadBankImage(image);
                        this.oSurf.execBlit(
                            this.oSurf.imageList[this.oSurf.selectedImage].canvas,
                            this.oSurf.imageList[image].context,
                            false,
                            (this.oSurf.imageList[this.oSurf.selectedImage].hasAlphaChannel && this.oSurf.imageList[image].hasAlphaChannel)
                        );
                    }
                    break;

                case CRunSurface.ACT_PUSH_BLIT_SETTINGS:
                    this.oSurf.pushBlitSettings();
                    break;

                case CRunSurface.ACT_POP_BLIT_SETTINGS:
                    this.oSurf.popBlitSettings();
                    break;

                case CRunSurface.ACT_ENABLE_BLIT_ALPHA_TRANSPARENCY:
                    this.oSurf.blit.useTransparency = true;
                    break;

                case CRunSurface.ACT_DISABLE_BLIT_ALPHA_TRANSPARENCY:
                    this.oSurf.blit.useTransparency = false;
                    break;

                case CRunSurface.ACT_SET_BLIT_EFFECT_BY_INDEX:
                    var index = act.getParamExpression(this.rh, 0);
                    switch (index) {
                        case 0:
                            this.oSurf.setBlitEffect('');
                            break;
                        case 1:
                            this.oSurf.setBlitEffect('semi-transparency');
                            break;
                        case 12:
                            this.oSurf.setBlitEffect('tint');
                            break;
                        case 3:
                            this.oSurf.setBlitEffect('xor');
                            break;
                        case 4:
                            this.oSurf.setBlitEffect('and');
                            break;
                        case 5:
                            this.oSurf.setBlitEffect('or');
                            break;
                    }
                    break;

                case CRunSurface.ACT_SET_BLIT_ALPHA_MODE:
                    var param = act.getParamExpression(this.rh, 0);
                    this.oSurf.blit.alphaComposition = param == 2;
                    break;

                case CRunSurface.ACT_SET_BLIT_EFFECT_BY_NAME:
                    var name = act.getParamExpString(this.rh, 0);
                    this.oSurf.setBlitEffect(name.toLowerCase());
                    break;

                case CRunSurface.ACT_ENABLE_BLIT_ALPHA_COMPOSITION:
                    this.oSurf.blit.alphaComposition = true;
                    break;
                case CRunSurface.ACT_DISABLE_BLIT_ALPHA_COMPOSITION:
                    this.oSurf.blit.alphaComposition = false;
                    break;

                case CRunSurface.ACT_SET_BLIT_CALLBACK_TO:
                    this.oSurf.blit.callback = act.getParamExpString(this.rh, 0);
                    break;

                case CRunSurface.ACT_ADD_BACKDROP:
                    var options = act.getParamAltValue(this.rh, 0);
                    imgCanvas = this.oSurf.imageList[this.oSurf.selectedImage].canvas;
                    var cImage = new CImage;
                    var image = new Image();
                    image.src = imgCanvas.toDataURL();
                    cImage.img = image;
                    this.ho.addBackdrop(cImage, this.oSurf.blit.xDest, this.oSurf.blit.yDest, options, this.ho.hoLayer);
                    break;

                case CRunSurface.ACT_BLIT_ONTO_THE_BACKGROUND:
                    if (this.appContext == null) break;
                    this.oSurf.execBlit(this.appContext.canvas, this.oSurf.imageList[this.oSurf.selectedImage].context);
                    break;

                case CRunSurface.ACT_BLIT_THE_BACKGROUND:
                    if (this.appContext == null) break;
                    this.oSurf.execBlit(this.oSurf.imageList[this.oSurf.selectedImage].canvas, this.appContext);
                    break;

                // POLYGON
                case CRunSurface.ACT_ADD_POINT:
                    var x = act.getParamExpression(this.rh, 0);
                    var y = act.getParamExpression(this.rh, 1);
                    this.oSurf.addPoint(x, y);
                    break;

                case CRunSurface.ACT_INSERT_POINT:
                    var index = act.getParamExpression(this.rh, 0);
                    var x = act.getParamExpression(this.rh, 1);
                    var y = act.getParamExpression(this.rh, 2);

                    this.oSurf.addPointAt(x, y, index);
                    break;

                case CRunSurface.ACT_ADD_POINT_FROM_STRING:
                    var str = act.getParamExpString(this.rh, 0);
                    var values = str.split(",");
                    for (var i = 0; i < values.length; i += 2) {
                        this.oSurf.addPoint(parseInt(values[i]), parseInt(values[i + 1]));
                    }

                // Load image
                case CRunSurface.ACT_LOAD_IMAGE_FROM_FILE:
                case CRunSurface.ACT_LOAD_IMAGE_FROM_FILE_OVERRIDE_EXTENSION:
                    var url = act.getParamFilename(this.rh, 0);
                    this.oSurf.fileIOinProgress = true;
                    this.oSurf.loadFileImage(this.oSurf.selectedImage, url, () => {
                        this.oSurf.fileIOinProgress = false;
                        this.ho.generateEvent(CRunSurface.CND_ON_LOADING_SUCCEEDED, 0);
                    }, () => {
                        this.oSurf.fileIOinProgress = false;
                        this.ho.generateEvent(CRunSurface.CND_ON_LOADING_FAILED, 0);
                    });
                    break;

                case CRunSurface.ACT_DRAW_TEXT:
                    var x1 = act.getParamExpression(this.rh, 0);
                    var y1 = act.getParamExpression(this.rh, 1);
                    var x2 = act.getParamExpression(this.rh, 2);
                    var y2 = act.getParamExpression(this.rh, 3);
                    var text = act.getParamExpString(this.rh, 4);
                    var color = this.getParamColour(act, 5);
                    this.oSurf.drawText(x1, y1, x2, y2, text, color);

                case CRunSurface.ACT_MOVE_ALL_POINTS_BY_PIXEL:
                    var x = act.getParamExpression(this.rh, 0);
                    var y = act.getParamExpression(this.rh, 1);
                    this.oSurf.moveAllPoints(x, y);

                    break;

                case CRunSurface.ACT_REMOVE_POINT:
                    this.oSurf.removePoint(index);
                    break;

                case CRunSurface.ACT_REMOVE_ALL_POINTS:
                    this.oSurf.deleteAllPoints();
                    break;

                case CRunSurface.ACT_ROTATE_ALL_POINTS_ARROUND:
                    var x = act.getParamExpression(this.rh, 0);
                    var y = act.getParamExpression(this.rh, 1);
                    var angle = act.getParamExpression(this.rh, 2);
                    this.oSurf.rotateAllPointsArround(x, y, angle);
                    break;

                case CRunSurface.ACT_SCALE_ALL_POINTS:
                    var x = act.getParamExpression(this.rh, 0);
                    var y = act.getParamExpression(this.rh, 1);
                    var scaleX = act.getParamExpression(this.rh, 2);
                    var scaleY = act.getParamExpression(this.rh, 3);
                    this.oSurf.scaleAllPointsArround(x, y, scaleX, scaleY);
                    break;

                case CRunSurface.ACT_CREATE_REGULAR_POLYGON:
                    var radius = act.getParamExpression(this.rh, 0);
                    var nbEdges = act.getParamExpression(this.rh, 1);
                    this.oSurf.createRegularPolygon(radius, nbEdges);
                    break;

                case CRunSurface.ACT_CREATE_STAR:
                    var innerRadius = act.getParamExpression(this.rh, 0);
                    var outerRadius = act.getParamExpression(this.rh, 1);
                    var nbPikes = act.getParamExpression(this.rh, 2);
                    this.oSurf.createStar(innerRadius, outerRadius, nbPikes);
                    break;

                case CRunSurface.ACT_DRAW_POLYGON_WITH_COLOR:
                    var x = act.getParamExpression(this.rh, 0);
                    var y = act.getParamExpression(this.rh, 1);
                    var color = this.getParamColour(act, 2);
                    this.oSurf.drawPolygon(x, y, CServices.getColorString(color), 0, 0);
                    break;

                case CRunSurface.ACT_DRAW_POLYGON:
                    var x = act.getParamExpression(this.rh, 0);
                    var y = act.getParamExpression(this.rh, 1);
                    var color = act.getParamExpression(this.rh, 2);
                    var thickness = act.getParamExpression(this.rh, 3);
                    var thicknessColor = this.getParamColour(act, 4);
                    color = (color != -1) ? CServices.getColorString(CServices.swapRGB(color)) : -1;

                    this.oSurf.drawPolygon(x, y, color, thickness, CServices.getColorString(thicknessColor));
                    break;

                case CRunSurface.ACT_DRAW_POLYGON_WITH_PATTERN:
                    var x = act.getParamExpression(this.rh, 0);
                    var y = act.getParamExpression(this.rh, 1);
                    var patternName = act.getParamExpString(this.rh, 2);
                    var thickness = act.getParamExpression(this.rh, 3);
                    var thicknessPatternName = act.getParamExpString(this.rh, 4);
                    this.oSurf.drawPolygon(x, y, patternName, thickness, thicknessPatternName);
                    break;

                // Load image
                case CRunSurface.ACT_LOAD_IMAGE_FROM_FILE:
                case CRunSurface.ACT_LOAD_IMAGE_FROM_FILE_OVERRIDE_EXTENSION:
                    var url = act.getParamFilename(this.rh, 0);
                    this.oSurf.fileIOinProgress = true;
                    this.oSurf.loadFileImage(this.oSurf.selectedImage, url, () => {
                        this.oSurf.fileIOinProgress = false;
                        this.ho.generateEvent(CRunSurface.CND_ON_LOADING_SUCCEEDED, 0);
                    }, () => {
                        this.oSurf.fileIOinProgress = false;
                        this.ho.generateEvent(CRunSurface.CND_ON_LOADING_FAILED, 0);
                    });
                    break;

                case CRunSurface.ACT_DRAW_TEXT:
                    var x1 = act.getParamExpression(this.rh, 0);
                    var y1 = act.getParamExpression(this.rh, 1);
                    var x2 = act.getParamExpression(this.rh, 2);
                    var y2 = act.getParamExpression(this.rh, 3);
                    var text = act.getParamExpString(this.rh, 4);
                    var color = this.getParamColour(act, 5);
                    this.oSurf.drawText(x1, y1, x2, y2, text, color);

                    break;

                case CRunSurface.ACT_SET_HORIZONTAL_TEXT_ALIGN:
                    var hAlign = act.getParamExpression(this.rh, 0);
                    this.oSurf.textParams.hAlign = parseInt(hAlign);
                    break;

                case CRunSurface.ACT_SET_VERTICAL_TEXT_ALIGN:
                    var vAlign = act.getParamExpression(this.rh, 0);
                    this.oSurf.textParams.vAlign = parseInt(vAlign);
                    break;

                case CRunSurface.ACT_SET_TEXT_MULTILINE:
                    break;

                case CRunSurface.ACT_SET_TEXT_FONT_FACE:
                    var family = act.getParamExpString(this.rh, 0);
                    this.oSurf.textParams.family = family;
                    break;

                case CRunSurface.ACT_SET_TEXT_FONT_SIZE:
                    var size = act.getParamExpression(this.rh, 0);
                    this.oSurf.textParams.size = size + "pt";
                    break;

                case CRunSurface.ACT_SET_TEXT_FONT_QUALITY:
                    break;

                case CRunSurface.ACT_SET_TEXT_FONT_WEIGHT:
                    var weight = act.getParamExpression(this.rh, 0);
                    this.oSurf.textParams.weight = parseInt(weight);
                    break;

                case CRunSurface.ACT_SET_TEXT_FONT_DECORATION:
                    var decoration = act.getParamExpression(this.rh, 0);
                    this.oSurf.textParams.decoration = parseInt(decoration);
                    break;

                case CRunSurface.ACT_SET_TEXT_ANGLE:
                    var angle = act.getParamExpression(this.rh, 0);
                    this.oSurf.textParams.angle = angle % 360;
                    break;
                // CALLBACK

                case CRunSurface.ACT_LOOP_THROUNGH_IMAGE_WITH_CALLBACK:
                    var flags = act.getParamExpression(this.rh, 0);
                    var name = act.getParamExpString(this.rh, 1);
                    this.oSurf.loopThroughImageWithCallback(name, flags, () => {
                        this.ho.generateEvent(CRunSurface.CND_ON_CALLBACK, name);
                    });
                    break;

                case CRunSurface.ACT_LOOP_THROUGH_WITH_CALLBACK:
                    var x1 = act.getParamExpression(this.rh, 0);
                    var y1 = act.getParamExpression(this.rh, 1);
                    var x2 = act.getParamExpression(this.rh, 2);
                    var y2 = act.getParamExpression(this.rh, 3);
                    var flags = act.getParamExpression(this.rh, 5);
                    var name = act.getParamExpString(this.rh, 4);

                    this.oSurf.loopThroughImageWithCallback(name, flags, () => {
                        this.ho.generateEvent(CRunSurface.CND_ON_CALLBACK, name);
                    }, x1, y1, x2, y2);
                    break;

                case CRunSurface.ACT_RETURN_COLOR_TO_CALLBACK:
                    var color = this.getParamColour(act, 0);
                    this.oSurf.setReturnColor(color);
                    break;

                case CRunSurface.ACT_RETURN_ALPHA_TO_CALLBACK:
                    var alpha = act.getParamExpression(this.rh, 0);
                    this.oSurf.setReturnAlpha(alpha);
                    break;

                case CRunSurface.ACT_FLOOD_FILL:
                    var x = act.getParamExpression(this.rh, 0);
                    var y = act.getParamExpression(this.rh, 1);
                    var color = this.getParamColour(act, 2);
                    var tolerence = act.getParamExpression(this.rh, 3);

                    this.oSurf.floodFill(x, y, color, tolerence + 1);
                    break;

                case CRunSurface.ACT_APPLY_COLOR_MATRIX:
                    var colorMatrix = [
                        [act.getParamExpression(this.rh, 0), act.getParamExpression(this.rh, 1), act.getParamExpression(this.rh, 2)],
                        [act.getParamExpression(this.rh, 3), act.getParamExpression(this.rh, 4), act.getParamExpression(this.rh, 5)],
                        [act.getParamExpression(this.rh, 6), act.getParamExpression(this.rh, 7), act.getParamExpression(this.rh, 8)],
                    ];
                    this.oSurf.applyColorMatrix(colorMatrix);
                    break;

                case CRunSurface.ACT_APPLY_CONVOLUTION_MATRIX:
                    var matrix = [
                        [act.getParamExpression(this.rh, 3), act.getParamExpression(this.rh, 4), act.getParamExpression(this.rh, 5)],
                        [act.getParamExpression(this.rh, 6), act.getParamExpression(this.rh, 7), act.getParamExpression(this.rh, 8)],
                        [act.getParamExpression(this.rh, 9), act.getParamExpression(this.rh, 10), act.getParamExpression(this.rh, 11)],
                    ];
                    this.oSurf.applyConvolutionMatrix(
                        act.getParamExpression(this.rh, 0),
                        act.getParamExpression(this.rh, 1),
                        act.getParamExpression(this.rh, 2),
                        matrix
                    );
                    break;

                case CRunSurface.ACT_SKYP_REDRAW:
                    this.oSurf.skipRedraw = true;
                    break;

                case CRunSurface.ACT_SET_CLIPPING_RECTANGLE:
                    this.oSurf.setClippingRect(act.getParamExpression(this.rh, 0), act.getParamExpression(this.rh, 1), act.getParamExpression(this.rh, 2), act.getParamExpression(this.rh, 3));
                    break;

                case CRunSurface.ACT_CLEAR_CLIPPING_RECTANGLE:
                    this.oSurf.clearClippingRect();
                    break;

                case CRunSurface.ACT_MOVE_CHANNELS:
                    this.oSurf.moveChannels(act.getParamExpString(this.rh, 0), act.getParamExpString(this.rh, 1), act.getParamExpString(this.rh, 2), act.getParamExpString(this.rh, 3));
                    break;

                case CRunSurface.ACT_MINIMIZE:
                    this.oSurf.cropImageAuto();
                    break;

                case CRunSurface.ACT_SET_LINEAR_RESAMPLING:
                    this.oSurf.imageList[this.oSurf.selectedImage].smoothScale = act.getParamExpression(this.rh, 0) == 1;
                    break;

                case CRunSurface.ACT_RESIZE_CANVAS:
                    this.oSurf.cropImage(
                        act.getParamExpression(this.rh, 0),
                        act.getParamExpression(this.rh, 1),
                        act.getParamExpression(this.rh, 2),
                        act.getParamExpression(this.rh, 3)
                    );
                    break;

                case CRunSurface.ACT_SAVE_IMAGE_TO_FILE:
                    this.oSurf.saveImage(act.getParamFilename(this.rh, 0), act.getParamExpString(this.rh, 1));
                    break;

                case CRunSurface.ACT_PERFORM_WITH_CHANNEL:
                    this.oSurf.perform(act.getParamExpString(this.rh, 0), act.getParamExpression(this.rh, 1), act.getParamExpString(this.rh, 2))
                    break;

                case CRunSurface.ACT_PERFORM_COLOR:
                    this.oSurf.performColor(act.getParamExpString(this.rh, 0), this.getParamColour(act, 1));
                    break;

                default:
                    console.log("ACTION: " + num + " NOT IMPLEMENTED");
            }
        },

        // Expression entry
        // ------------------------------------------------------------------
        expression: function (num) {
            switch (num) {
                case CRunSurface.EXP_IMAGE_COUNT:
                    return this.oSurf.nImages;

                case CRunSurface.EXP_SEL_IMAGE:
                    return this.oSurf.selectedImage;

                case CRunSurface.EXP_DISPLAY_IMAGE:
                    return this.oSurf.currentImage;

                case CRunSurface.EXP_RGB_AT:
                    var x = this.ho.getExpParam();
                    var y = this.ho.getExpParam();
                    return this.oSurf.getRGBAt(this.oSurf.selectedImage, x, y);

                case CRunSurface.EXP_WIDTH:
                    return this.oSurf.getWidth(this.oSurf.selectedImage);

                case CRunSurface.EXP_HEIGHT:
                    return this.oSurf.getHeight(this.oSurf.selectedImage);

                case CRunSurface.EXP_DISPLAY_WIDTH:
                    return this.oSurf.getWidth(this.oSurf.currentImage);

                case CRunSurface.EXP_DISPLAY_HEIGHT:
                    return this.oSurf.getHeight(this.oSurf.currentImage);

                case CRunSurface.EXP_IMG_WIDTH:
                    var index = this.ho.getExpParam();
                    return this.oSurf.getWidth(index);

                case CRunSurface.EXP_IMG_HEIGHT:
                    var index = this.ho.getExpParam();
                    return this.oSurf.getHeight(index);

                case CRunSurface.EXP_IMG_RGB_AT:
                    var index = this.ho.getExpParam();
                    var x = this.ho.getExpParam();
                    var y = this.ho.getExpParam();

                    return this.oSurf.getRGBAt(index, x, y);

                case CRunSurface.EXP_PATTERN:
                    var index = this.ho.getExpParam();
                    var pattern = this.oSurf.getPattern(index);
                    return pattern ? pattern.name : "";

                case CRunSurface.EXP_PATTERN_COUNT:
                    return Object.keys(this.oSurf.patterns).length;

                case CRunSurface.EXP_PATTERN_COLOR:
                    var name = this.ho.getExpParam();
                    var pattern = this.oSurf.getPattern(name);

                    return pattern ? pattern.color : 0;

                case CRunSurface.EXP_PATTERN_COLOR_A:
                    var name = this.ho.getExpParam();
                    var pattern = this.oSurf.getPattern(name);

                    return pattern ? pattern.colorA : 0;

                case CRunSurface.EXP_PATTERN_COLOR_B:
                    var name = this.ho.getExpParam();
                    var pattern = this.oSurf.getPattern(name);

                    return pattern ? pattern.colorB : 0;

                case CRunSurface.EXP_PATTERN_IMAGE:
                    var name = this.ho.getExpParam();
                    var pattern = this.oSurf.getPattern(name);

                    return pattern ? pattern.tiledImage : 0;

                case CRunSurface.EXP_RED_AT:
                    var x = this.ho.getExpParam();
                    var y = this.ho.getExpParam();
                    return this.oSurf.getRed(this.TargetImage.selectedImage, x, y);

                case CRunSurface.EXP_GREEN_AT:
                    var x = this.ho.getExpParam();
                    var y = this.ho.getExpParam();
                    return this.oSurf.getGreen(this.TargetImage.selectedImage, x, y);

                case CRunSurface.EXP_BLUE_AT:
                    var x = this.ho.getExpParam();
                    var y = this.ho.getExpParam();
                    return this.oSurf.getBlue(this.TargetImage.selectedImage, x, y);

                case CRunSurface.EXP_ALPHA_AT:
                    var x = this.ho.getExpParam();
                    var y = this.ho.getExpParam();
                    return this.oSurf.getAlpha(this.TargetImage.selectedImage, x, y);

                case CRunSurface.EXP_IMG_RED_AT:
                    var image = this.ho.getExpParam();
                    var x = this.ho.getExpParam();
                    var y = this.ho.getExpParam();
                    return this.oSurf.getRed(image, x, y);

                case CRunSurface.EXP_IMG_GREEN_AT:
                    var image = this.ho.getExpParam();
                    var x = this.ho.getExpParam();
                    var y = this.ho.getExpParam();
                    return this.oSurf.getGreen(image, x, y);

                case CRunSurface.EXP_IMG_BLUE_AT:
                    var image = this.ho.getExpParam();
                    var x = this.ho.getExpParam();
                    var y = this.ho.getExpParam();
                    return this.oSurf.getBlue(image, x, y);

                case CRunSurface.EXP_IMG_ALPHA_AT:
                    var image = this.ho.getExpParam();
                    var x = this.ho.getExpParam();
                    var y = this.ho.getExpParam();
                    return this.oSurf.getAlpha(image, x, y);

                case CRunSurface.EXP_INVERT:
                    var color = this.ho.getExpParam();
                    var newColor = this.oSurf.getInvertColor(color);
                    return newColor;

                case CRunSurface.EXP_TRANSP_COLOR:
                    return this.oSurf.imageList[this.oSurf.selectedImage].transparentColor;

                case CRunSurface.EXP_IMG_TRANSP_COLOR:
                    var image = this.ho.getExpParam();
                    if (this.oSurf.hasImageIndex(image))
                        return this.oSurf.imageList[image].transparentColor;
                    return 0;

                case CRunSurface.EXP_CALLBACK_X:
                    return this.oSurf.callback.xPos;

                case CRunSurface.EXP_CALLBACK_Y:
                    return this.oSurf.callback.yPos;

                case CRunSurface.EXP_CALLBACK_AREA_X1:
                    return 0;
                case CRunSurface.EXP_CALLBACK_AREA_Y1:
                    return 0;
                case CRunSurface.EXP_CALLBACK_AREA_X2:
                    return 0;
                case CRunSurface.EXP_CALLBACK_AREA_Y2:
                    return 0;

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
                    var image = this.ho.getExpParam();
                    if (this.oSurf.hasImageIndex(image))
                        return this.oSurf.imageList[image].hotSpot.x;
                    return 0;

                case CRunSurface.EXP_IMG_HOT_Y:
                    var image = this.ho.getExpParam();
                    if (this.oSurf.hasImageIndex(image))
                        return this.oSurf.imageList[image].hotSpot.y;
                    return 0;

                case CRunSurface.EXP_HOT_X:
                    return this.oSurf.imageList[this.oSurf.selectedImage].hotSpot.x;

                case CRunSurface.EXP_HOT_Y:
                    return this.oSurf.imageList[this.oSurf.selectedImage].hotSpot.y;

                case CRunSurface.EXP_X_SCALE:
                    return this.oSurf.imageList[this.oSurf.selectedImage].xScale;

                case CRunSurface.EXP_Y_SCALE:
                    return this.oSurf.imageList[this.oSurf.selectedImage].yScale;

                case CRunSurface.EXP_RANDOM_COLOR:
                    var r = Math.floor(Math.random() * 256),
                        g = Math.floor(Math.random() * 256),
                        b = Math.floor(Math.random() * 256);
                    return CServices.swapRGB((r << 16) | (g << 8) | b);

                case CRunSurface.EXP_MULTIPLY:
                    var colorA = this.ho.getExpParam();
                    var colorB = this.ho.getExpParam();
                    return this.oSurf.multiplyColors(colorA, colorB);

                case CRunSurface.EXP_COMPOSED_COLOR:
                    var ca = this.ho.getExpParam();
                    var aa = this.ho.getExpParam();
                    var cb = this.ho.getExpParam();
                    var ab = this.ho.getExpParam();

                    var sr = CServices.getRValueFlash(ca);
                    var sg = CServices.getGValueFlash(ca);
                    var sb = CServices.getBValueFlash(ca);
                    var dr = CServices.getRValueFlash(cb);
                    var dg = CServices.getGValueFlash(cb);
                    var db = CServices.getBValueFlash(cb);

                    var a = aa + ab * (1 - aa);
                    var r = (sr * aa + dr * ab * (1 - aa)) / a;
                    var g = (sg * aa + dg * ab * (1 - aa)) / a;
                    var b = (sb * aa + db * ab * (1 - aa)) / a;

                    r = Math.max(0, Math.min(255, r));
                    g = Math.max(0, Math.min(255, g));
                    b = Math.max(0, Math.min(255, b));

                    return CServices.swapRGB((r << 16) | (g << 8) | b);

                case CRunSurface.EXP_COMPOSED_ALPHA:
                    var sa = this.ho.getExpParam();
                    var da = this.ho.getExpParam();
                    var a = sa + da * (1 - sa);
                    return Math.max(0, Math.min(255, a));

                case CRunSurface.EXP_ADD:
                    var colorA = this.ho.getExpParam();
                    var colorB = this.ho.getExpParam();
                    return this.oSurf.addColors(colorA, colorB);

                case CRunSurface.EXP_SUBSTRACT:
                    var colorA = this.ho.getExpParam();
                    var colorB = this.ho.getExpParam();
                    return this.oSurf.substractColors(colorA, colorB);

                case CRunSurface.EXP_RGB:
                    var r = this.ho.getExpParam();
                    var g = this.ho.getExpParam();
                    var b = this.ho.getExpParam();

                    return CServices.swapRGB((r << 16) | (g << 8) | b);

                case CRunSurface.EXP_HEX_TO_RGB:
                    var hex = this.ho.getExpParam();
                    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);

                    return CServices.swapRGB((parseInt(result[1], 16) << 16) | (parseInt(result[2], 16) << 8) | parseInt(result[3], 16));

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
                    var ca = this.ho.getExpParam();
                    var cb = this.ho.getExpParam();
                    var blend = this.ho.getExpParam();
                    var ar = CServices.getRValueFlash(ca);
                    var ag = CServices.getGValueFlash(ca);
                    var ab = CServices.getBValueFlash(ca);
                    var br = CServices.getRValueFlash(cb);
                    var bg = CServices.getGValueFlash(cb);
                    var bb = CServices.getBValueFlash(cb);

                    return CServices.swapRGB(((ar + (br - ar) * blend << 16) | (ag + (bg - ag) * blend << 8) | (ab + (bb - ab) * blend)));

                case CRunSurface.EXP_SCREEN_TO_IMG_X:
                    var screenX = this.ho.getExpParam();
                    var screenY = this.ho.getExpParam();

                    return 0;
                case CRunSurface.EXP_SCREEN_TO_IMG_Y:
                    var screenX = this.ho.getExpParam();
                    var screenY = this.ho.getExpParam();

                    return 0;

                case CRunSurface.EXP_FILTER_EXT_COUNT:
                    return 0;
                default:
                    console.log("EXPRESSION " + num + " NOT IMPLEMENTED");
            }
            return 0;
        }
    });
