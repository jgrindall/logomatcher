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
		"distance":3,
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
	
	var _isInside = function(yourCanvas, targetCanvas, options){
		var numYourFullPixels, thickendTargetCanvas, offsets, _outside, minOutside, minIndex, minOffset, illus, stickingOut, translated;
		options = _.defaults(options || {}, DEFAULTS);
		numYourFullPixels = _countFull(yourCanvas, options);
		offsets = _getOffsets(options.distance);
		thickendTargetCanvas = _thicken(targetCanvas, options.thickness, options.alphaTolerance);
		_outside = _.map(offsets, function(offset){
			var outside = _getOutsideForOffset(yourCanvas, thickendTargetCanvas, offset, options);
			options.currentMaximum = outside;
			return outside;
		});
		minOutside = _.min(_outside);
		minIndex = _outside.indexOf(minOutside);
		minOffset = offsets[minIndex];
		illus = document.createElement("canvas");
		illus.width = yourCanvas.width;
		illus.height = yourCanvas.height;
		illus.getContext("2d").drawImage(thickendTargetCanvas, 0, 0);  // draw the grey one
		//draw bits of yours that stick out
		translated = _getTranslated(yourCanvas, minOffset);
		_removeUsingMask(translated, thickendTargetCanvas);
		illus.getContext("2d").drawImage(translated, 0, 0);
		return {
			"illustration":illus,
			"percentOutside":(100*minOutside/numYourFullPixels).toFixed(2)
		};
	};
	
	window.getPercentagePixelsOutside = _isInside;
})();
