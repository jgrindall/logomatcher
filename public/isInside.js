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
		"distance":4
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
	
	var _isInside = function(canvas, targetCanvas, options){
		options = _.defaults(options || {}, DEFAULTS);
		var data = canvas.getContext("2d").getImageData(0,0, canvas.width, canvas.height);
		var offsets = _getOffsets(options.distance);
		var thickendCanvas = _thicken(targetCanvas, options.thickness, options.alphaTolerance);
		var _output = [];
		var targetData = thickendCanvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
		_.each(offsets, function(offset, offsetIndex){
			var numPixels = 0;
			var numOutside = 0;
			for(var i = 0; i < canvas.width; i++){
				for(var j = 0; j < canvas.height; j++){
					var p = _getPixelAt(i + offset.dx, j + offset.dy, data);
					var q = _getPixelAt(i, j, targetData);
					if(p.a > options.alphaTolerance){
						// considered a solid pixel in your image
						numPixels++;
						if(q.a < options.alphaTolerance){
							// outside of the mask area allowed
							numOutside++;
						}
					}
				}
			}
			_output[offsetIndex] = {
				"numPixels":numPixels,
				"numOutside":numOutside,
				"percentOutside":parseFloat((100*numOutside/numPixels).toFixed(2)),
				"offset":offset,
				"offsetIndex":offsetIndex
			};
		});
		_output = _.sortBy(_output, function(obj){
			return obj.percentOutside;
		});
		var bestData = _output[0];
		var bestOffset = offsets[_output[0].offsetIndex];
		var illus = document.createElement("canvas");
		illus.width = canvas.width;
		illus.height = canvas.height;
		illus.getContext("2d").drawImage(thickendCanvas, 0, 0);
		var illusImgData = illus.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
		for(var i = 0; i < canvas.width; i++){
			for(var j = 0; j < canvas.height; j++){
				var p = _getPixelAt(i + bestOffset.dx, j + bestOffset.dy, data);
				var q = _getPixelAt(i, j, targetData);
				if(p.a > options.alphaTolerance){
					// solid in yours
					if(q.a < options.alphaTolerance){
						// it shouldn't be there
						_setPixelAt(i, j, illusImgData, RED);
					}
				}
			}
		}
		
		illus.getContext("2d").putImageData(illusImgData, 0, 0);
		bestData.illustration = illus;
		return bestData;
	};
	
	window.getPercentagePixelsOutside = _isInside;
})();
