(function(){
	
	var _getPixelAt = function(i, j, imgData){
		var index;
		if(i >= 0 && i < imgData.width && j >= 0 && j < imgData.height){
			index = (j*imgData.width + i)*4;
			return {
				r:imgData.data[index + 0],
				g:imgData.data[index + 1],
				b:imgData.data[index + 2],
				a:imgData.data[index + 3]
			};
		}
		else{
			return {
				r:0,
				g:0,
				b:0,
				a:0
			};
		}
	};
	
	var _setPixelAt = function(i, j, imgData, obj){
		var index;
		if(i >= 0 && i < imgData.width && j > 0 && j < imgData.height && obj){
			index = (j*imgData.width + i)*4;
			imgData.data[index + 0] = obj.r;
			imgData.data[index + 1] = obj.g;
			imgData.data[index + 2] = obj.b;
			imgData.data[index + 3] = obj.a;
		}
	};
	
	var DEFAULTS = {
		"thickness":8,
		"alphaTolerance":40,
		"distance":5,
		"currentMaximum":undefined
	};
	
	var GREY_MASK = {r:210, b:210, g:210, a:255};
	var EMPTY = {r:0, b:0, g:0, a:0};
	var RED = {r:255, b:0, g:0, a:255};
	
	var _thicken = function(canvas, thickness, alphaTolerance){
		var c = document.createElement("canvas");
		c.width = canvas.width;
		c.height = canvas.height;
		c.getContext("2d").drawImage(canvas, 0, 0);
		if(thickness > 0){
			StackBlur.canvasRGBA(c, 0, 0, canvas.width, canvas.height, thickness);
		}
		var imgData = c.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
		for(var i = 0; i < canvas.width; i++){
			for(var j = 0; j < canvas.height; j++){
				var p = _getPixelAt(i, j, imgData);
				if(p.a > alphaTolerance){
					_setPixelAt(i, j, imgData, GREY_MASK);  //black
				}
				else{
					_setPixelAt(i, j, imgData, EMPTY);    // empty
				}
			}
		}
		c.getContext("2d").putImageData(imgData, 0, 0);
		return c;
	};
	
	var _getOffsets = function(d){
		var offsets = [];
		var dSqr = d*d;
		for(var i = -d; i <= d; i++){
			for(var j = -d; j <= d; j++){
				var myDSqr = i*i + j*j;
				if(myDSqr < dSqr){
					offsets.push({
						dx:i,
						dy:j
					});
				}
			}
		}
		return offsets;
	};
	
	var _countFull = function(canvas, options){
		var currentMaximum, imgData, len, count, i;
		currentMaximum = ( (typeof options === "undefined" || typeof options.currentMaximum === "undefined") ? Infinity : options.currentMaximum);
		imgData = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
		len = imgData.data.length;
		count = 0;
		for(i = 3; i < len; i += 4){
			if(imgData.data[i] > options.alphaTolerance){
				count++;
				if(count > currentMaximum){
					return Infinity;
				}
			}
		}
		return count;
	};
	
	var _getTranslated = function(canvas, offset){
		var newCanvas = document.createElement("canvas");
		newCanvas.width = canvas.width;
		newCanvas.height = canvas.height;
		newCanvas.getContext("2d").drawImage(canvas, offset.dx, offset.dy);
		return newCanvas;
	};
	
	var _removeUsingMask = function(canvas, maskCanvas){
		var context = canvas.getContext("2d");
		context.save();
		context.globalCompositeOperation = "destination-out";
		context.drawImage(maskCanvas, 0, 0);
		context.restore();
	};
	
	var _getOutsideForOffset = function(yourCanvas, maskCanvas, offset, options){
		var translatedCanvas = _getTranslated(yourCanvas, offset);
		_removeUsingMask(translatedCanvas, maskCanvas);
		return _countFull(translatedCanvas, options);
	};
	
	var _reverse = function(offset){
		return {
			dx:offset.dx * -1,
			dy:offset.dy * -1
		};
	};
	
	var _colorify = function(canvas, color, options){
		var imgData, len, i, coloredCanvas;
		coloredCanvas = document.createElement("canvas");
		coloredCanvas.width = canvas.width;
		coloredCanvas.height = canvas.height;
		imgData = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
		len = imgData.data.length - 3;
		count = 0;
		for(i = 0; i < len; i += 4){
			if(imgData.data[i + 3] > options.alphaTolerance){
				imgData.data[i + 0] = color.r;
				imgData.data[i + 1] = color.g;
				imgData.data[i + 2] = color.b;
				imgData.data[i + 3] = 255;
			}
		}
		coloredCanvas.getContext("2d").putImageData(imgData, 0, 0);
		return coloredCanvas;
	};
	
	var _getOutside = function(yourCanvas, targetCanvas, options){
		var numYourFullPixels, thickendTargetCanvas, offsets, _outside, minOutside, minIndex, minOffset, translated;
		options.currentMaximum = undefined;
		numYourFullPixels = _countFull(yourCanvas, options);
		offsets = _getOffsets(options.distance);
		thickendTargetCanvas = _thicken(targetCanvas, options.thickness, options.alphaTolerance);
		_outside = _.map(offsets, function(offset){
			var outside = _getOutsideForOffset(yourCanvas, thickendTargetCanvas, offset, options);
			if(outside < Infinity){
				options.currentMaximum = outside;
			}
			return outside;
		});
		minOutside = _.min(_outside);
		minIndex = _outside.indexOf(minOutside);
		minOffset = offsets[minIndex];
		translated = _getTranslated(yourCanvas, minOffset);
		_removeUsingMask(translated, thickendTargetCanvas);
		translated = _getTranslated(translated, _reverse(minOffset));
		return {
			"illustration":translated,
			"percentOutside":(100*minOutside/numYourFullPixels).toFixed(2)
		};
	};
	
	window.imageCompare = function(yourCanvas, targetCanvas, options){
		var outside, missing, illustration;
		options = _.defaults(options || {}, DEFAULTS);
		outside = _getOutside(canvas0, canvas1, options);
		missing = _getOutside(canvas1, canvas0, options);
		outside.illustration = _colorify(outside.illustration, {r:200, g:0, b:0, a:255}, options);
		missing.illustration = _colorify(missing.illustration, {r:200, g:0, b:0, a:255}, options);
		illustration = document.createElement("canvas");
		illustration.width = yourCanvas.width;
		illustration.height = yourCanvas.height;
		illustration.getContext("2d").drawImage(outside.illustration, 0, 0);
		illustration.getContext("2d").drawImage(missing.illustration, 0, 0);
		
		return {
			"outside":outside.percentOutside,
			"missing":missing.percentOutside,
			"outsideIllustration":outside.illustration,
			"missingIllustration":missing.illustration
		};
	};
	
})();
