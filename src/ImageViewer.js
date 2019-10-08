import {
  createElement,
  addClass,
  removeClass,
  css,
  removeCss,
  wrap,
  unwrap,
  remove,
  easeOutQuart,
  imageLoaded,
  clamp,
  assignEvent,
  getTouchPointsDistance,
  ZOOM_CONSTANT,
  MOUSE_WHEEL_COUNT,
} from './util';

import Slider from './Slider';

const imageViewHtml = `
  <div class="iv-loader"></div>
  <div class="iv-snap-view">
    <div class="iv-snap-image-wrap">
      <div class="iv-snap-handle"></div>
    </div>
    <div class="iv-zoom-minus noselect">-</div>
    <div class="iv-zoom-slider">
      <div class="iv-zoom-handle"></div>
    </div>
    <div class="iv-zoom-plus noselect">+</div>
  </div>
  <div class="iv-image-view" >
    <div class="iv-image-wrap" ></div>
  </div>
`;

class ImageViewer {
  constructor (element, options = {}) {
    const { container, domElement, imageSrc, hiResImageSrc } = this._findContainerAndImageSrc(element, options);

    // containers for elements
    this._elements = {
      container,
      domElement,
    };

    this._options = { ...ImageViewer.defaults, ...options };

    // container for all events
    this._events = {

    };

    // container for all timeout and frames
    this._frames = {

    };

    // container for all sliders
    this._sliders = {

    };

    // maintain current state
    this._state = {
      zoomValue: this._options.zoomValue,
    };

    this._images = {
      imageSrc,
      hiResImageSrc,
    };

    this._init();

    if (imageSrc) {
      this._loadImages();
    }

    // store reference of imageViewer in domElement
    domElement._imageViewer = this;
  }

  _findContainerAndImageSrc (element) {
    let domElement = element;
    let imageSrc, hiResImageSrc;

    if (typeof element === 'string') {
      domElement = document.querySelector(element);
    }

    // throw error if imageViewer is already assigned
    if (domElement._imageViewer) {
      throw new Error('An image viewer is already being initiated on the element.');
    }

    let container = element;

    if (domElement.tagName === 'IMG') {
      imageSrc = domElement.src;
      hiResImageSrc = domElement.getAttribute('high-res-src') || domElement.getAttribute('data-high-res-src');

      // wrap the image with iv-container div
      container = wrap(domElement, {
        className: 'iv-container iv-image-mode',
        style: 'display: inline-block; overflow: hidden',
      });

      // hide the image and add iv-original-img class
      css(domElement, {
        opacity: 0,
        position: 'relative',
        zIndex: -1,
      });
    } else {
      imageSrc = domElement.getAttribute('src') || domElement.getAttribute('data-src');
      hiResImageSrc = domElement.getAttribute('high-res-src') || domElement.getAttribute('data-high-res-src');
    }

    return {
      container,
      domElement,
      imageSrc,
      hiResImageSrc,
    };
  }

  _init () {
    // initialize the dom elements
    this._initDom();

    // initialize slider
    this._initImageSlider();
    this._initSnapSlider();
    this._initZoomSlider();

    // enable pinch and zoom feature for touch screens
    this._pinchAndZoom();

    // enable scroll zoom interaction
    this._scrollZoom();

    // enable double tap to zoom interaction
    this._doubleTapToZoom();

    // initialize events
    this._initEvents();
  }

  _initDom () {
    const { container } = this._elements;

    // add image-viewer layout elements
    createElement({
      tagName: 'div',
      className: 'iv-wrap',
      html: imageViewHtml,
      parent: container,
    });

    // add container class on the container
    addClass(container, 'iv-container');

    // if the element is static position, position it relatively
    if (css(container, 'position') === 'static') {
      css(container, { position: 'relative' });
    }

    // save references for later use
    this._elements = {
      ...this._elements,
      snapView: container.querySelector('.iv-snap-view'),
      snapImageWrap: container.querySelector('.iv-snap-image-wrap'),
      imageWrap: container.querySelector('.iv-image-wrap'),
      snapHandle: container.querySelector('.iv-snap-handle'),
      zoomHandle: container.querySelector('.iv-zoom-handle'),
      minusHandle: container.querySelector('.iv-zoom-minus'),
      plusHandle: container.querySelector('.iv-zoom-plus'),
    };
  }

  _initImageSlider () {
    const {
      _elements,
    } = this;

    const { imageWrap } = _elements;

    let positions, currentPos;

    /* Add slide interaction to image */
    const imageSlider = new Slider(imageWrap, {
      isSliderEnabled: () => {
        const { loaded, zooming, zoomValue } = this._state;
        return loaded && !zooming;
      },
      onStart: (e, position) => {
        const { snapSlider } = this._sliders;

        // clear all animation frame and interval
        this._clearFrames();

        snapSlider.onStart();

        // reset positions
        positions = [position, position];
        currentPos = undefined;

        this._frames.slideMomentumCheck = setInterval(() => {
          if (!currentPos) return;

          positions.shift();
          positions.push({
            x: currentPos.mx,
            y: currentPos.my,
          });
        }, 50);
      },
      onMove: (e, position) => {
        const { snapImageDim } = this._state;
        const { snapSlider } = this._sliders;
        const imageCurrentDim = this._getImageCurrentDim();
        currentPos = position;

        snapSlider.onMove(e, {
          dx: -position.dx * snapImageDim.w / imageCurrentDim.w,
          dy: -position.dy * snapImageDim.h / imageCurrentDim.h,
        });
      },
      onEnd: () => {
        const { snapImageDim } = this._state;
        const { snapSlider } = this._sliders;
        const imageCurrentDim = this._getImageCurrentDim();

        // clear all animation frame and interval
        this._clearFrames();

        let step, positionX, positionY;

        const xDiff = positions[1].x - positions[0].x;
        const yDiff = positions[1].y - positions[0].y;

        const momentum = () => {
          if (step <= 60) {
            this._frames.sliderMomentumFrame = requestAnimationFrame(momentum);
          }

          positionX += easeOutQuart(step, xDiff / 3, -xDiff / 3, 60);
          positionY += easeOutQuart(step, yDiff / 3, -yDiff / 3, 60);

          snapSlider.onMove(null, {
            dx: -(positionX * snapImageDim.w / imageCurrentDim.w),
            dy: -(positionY * snapImageDim.h / imageCurrentDim.h),
          });

          step++;
        };

        if (Math.abs(xDiff) > 30 || Math.abs(yDiff) > 30) {
          step = 1;
          positionX = currentPos.dx;
          positionY = currentPos.dy;

          momentum();
        }
      },
    });

    imageSlider.init();

    this._sliders.imageSlider = imageSlider;
  }

  _initSnapSlider () {
    const {
      snapHandle,
    } = this._elements;

    let startHandleTop, startHandleLeft;

    const snapSlider = new Slider(snapHandle, {
      isSliderEnabled: () => {
        return this._state.loaded;
      },
      onStart: () => {
        const { slideMomentumCheck, sliderMomentumFrame } = this._frames;

        startHandleTop = parseFloat(css(snapHandle, 'top'));
        startHandleLeft = parseFloat(css(snapHandle, 'left'));

        // stop momentum on image
        clearInterval(slideMomentumCheck);
        cancelAnimationFrame(sliderMomentumFrame);
      },
      onMove: (e, position) => {
        const { snapHandleDim, snapImageDim } = this._state;
        const { image } = this._elements;

        const imageCurrentDim = this._getImageCurrentDim();

        // find handle left and top and make sure they lay between the snap image
        var extraWidthMargin = snapHandleDim.w / 2;
        var extraHeightMargin = snapHandleDim.h / 2;

        var maxLeft = Math.max((snapImageDim.w + extraWidthMargin) - snapHandleDim.w, startHandleLeft);
        var maxTop = Math.max((snapImageDim.h + extraHeightMargin) - snapHandleDim.h, startHandleTop);
        var minLeft = Math.min(-extraWidthMargin, startHandleLeft);
        var minTop = Math.min(-extraHeightMargin, startHandleTop);

        let left = clamp(startHandleLeft + position.dx, minLeft, maxLeft);
        let top = clamp(startHandleTop + position.dy, minTop, maxTop);

        const imgLeft = -left * imageCurrentDim.w / snapImageDim.w;
        const imgTop = -top * imageCurrentDim.h / snapImageDim.h;

        css(snapHandle, {
          left: `${left}px`,
          top: `${top}px`,
        });

        css(image, {
          left: `${imgLeft}px`,
          top: `${imgTop}px`,
        });
      },
    });

    snapSlider.init();

    this._sliders.snapSlider = snapSlider;
  }

  _initZoomSlider () {
    const { snapView, zoomHandle, minusHandle, plusHandle } = this._elements;

    // zoom in zoom out using zoom handle
    const sliderElm = snapView.querySelector('.iv-zoom-slider');

    let leftOffset, handleWidth;

    // on zoom slider we have to follow the mouse and set the handle to its position.
    const zoomSlider = new Slider(sliderElm, {
      isSliderEnabled: () => {
        return this._state.loaded;
      },
      onStart: (eStart) => {
        const { zoomSlider: slider } = this._sliders;

        leftOffset = sliderElm.getBoundingClientRect().left + document.body.scrollLeft;
        handleWidth = parseInt(css(zoomHandle, 'width'), 10);

        // move the handle to current mouse position
        slider.onMove(eStart);
      },
      onMove: (e) => {
        const { maxZoom } = this._options;
        const { zoomSliderLength } = this._state;

        const pageX = e.pageX !== undefined ? e.pageX : e.touches[0].pageX;

        const newLeft = clamp(pageX - leftOffset - handleWidth / 2, 0, zoomSliderLength);

        const zoomValue = 100 + ((maxZoom - 100) * newLeft / zoomSliderLength);

        this.zoom(zoomValue);
      },
    });

    zoomSlider.init();
    this._sliders.zoomSlider = zoomSlider;

    this._events.onZoomMinusClick = assignEvent(minusHandle, 'click', () => {
      const { zoomValue } = this._state;
      const newZoomValue = zoomValue - ZOOM_CONSTANT;
      this.zoom(newZoomValue);
    });
    this._events.onZoomPlusClick = assignEvent(plusHandle, 'click', () => {
      const { zoomValue } = this._state;
      const newZoomValue = zoomValue + ZOOM_CONSTANT;
      this.zoom(newZoomValue);
    });
  }

  _initEvents () {
    this._snapViewEvents();

    // handle window resize
    if (this._options.refreshOnResize) {
      this._events.onWindowResize = assignEvent(window, 'resize', this.refresh);
    }
  }

  _snapViewEvents () {
    const { imageWrap, snapView } = this._elements;

    // show snapView on mouse move
    this._events.snapViewOnMouseMove = assignEvent(imageWrap, ['touchmove', 'mousemove'], () => {
      this.showSnapView();
    });

    // keep showing snapView if on hover over it without any timeout
    this._events.mouseEnterSnapView = assignEvent(snapView, ['mouseenter', 'touchstart'], () => {
      this._state.snapViewVisible = false;
      this.showSnapView(true);
    });

    // on mouse leave set timeout to hide snapView
    this._events.mouseLeaveSnapView = assignEvent(snapView, ['mouseleave', 'touchend'], () => {
      this._state.snapViewVisible = false;
      this.showSnapView();
    });
  }

  _pinchAndZoom () {
    const { imageWrap, container } = this._elements;

    // apply pinch and zoom feature
    const onPinchStart = (eStart) => {
      const { loaded, zoomValue: startZoomValue } = this._state;
      const { _events: events } = this;

      if (!loaded) return;

      const touch0 = eStart.touches[0];
      const touch1 = eStart.touches[1];

      if (!(touch0 && touch1)) {
        return;
      }

      this._state.zooming = true;

      const contOffset = container.getBoundingClientRect();

      // find distance between two touch points
      const startDist = getTouchPointsDistance(eStart.touches);

      // find the center for the zoom
      const center = {
        x: (touch1.pageX + touch0.pageX) / 2 - (contOffset.left + document.body.scrollLeft),
        y: (touch1.pageY + touch0.pageY) / 2 - (contOffset.top + document.body.scrollTop),
      };

      const moveListener = (eMove) => {
        // eMove.preventDefault();

        const newDist = getTouchPointsDistance(eMove.touches);

        const zoomValue = startZoomValue + (newDist - startDist) / 2;

        this.zoom(zoomValue, center);
      };

      const endListener = () => {
        // unbind events
        events.pinchMove();
        events.pinchEnd();
        this._state.zooming = false;
      };

      // remove events if already assigned
      if (events.pinchMove) events.pinchMove();
      if (events.pinchEnd) events.pinchEnd();

      // assign events
      events.pinchMove = assignEvent(document, 'touchmove', moveListener);
      events.pinchEnd = assignEvent(document, 'touchend', endListener);
    };

    this._events.pinchStart = assignEvent(imageWrap, 'touchstart', onPinchStart);
  }

  _scrollZoom () {
    /* Add zoom interaction in mouse wheel */
    const { _options } = this;
    const { container, imageWrap } = this._elements;

    let changedDelta = 0;

    const onMouseWheel = (e) => {
      const { loaded, zoomValue } = this._state;

      if (!_options.zoomOnMouseWheel || !loaded) return;

      // clear all animation frame and interval
      this._clearFrames();

      // cross-browser wheel delta
      const delta = Math.max(-1, Math.min(1, e.wheelDelta || -e.detail || -e.deltaY));

      const newZoomValue = zoomValue * (100 + delta * ZOOM_CONSTANT) / 100;

      if (!(newZoomValue >= 100 && newZoomValue <= _options.maxZoom)) {
        changedDelta += Math.abs(delta);
      } else {
        changedDelta = 0;
      }

      e.preventDefault();

      if (changedDelta > MOUSE_WHEEL_COUNT) return;

      const contOffset = container.getBoundingClientRect();

      const x = (e.pageX || e.pageX) - (contOffset.left + document.body.scrollLeft);
      const y = (e.pageY || e.pageY) - (contOffset.top + document.body.scrollTop);

      this.zoom(newZoomValue, {
        x,
        y,
      });

      // show the snap viewer
      this.showSnapView();
    };

    this._ev = assignEvent(imageWrap, 'wheel', onMouseWheel);
  }

  _doubleTapToZoom () {
    const { imageWrap } = this._elements;
    // handle double tap for zoom in and zoom out

    let touchTime = 0;

    let point;

    const onDoubleTap = (e) => {
      if (touchTime === 0) {
        touchTime = Date.now();
        point = {
          x: e.pageX,
          y: e.pageY,
        };
      } else if (Date.now() - touchTime < 500 && Math.abs(e.pageX - point.x) < 50 && Math.abs(e.pageY - point.y) < 50) {
        if (this._state.zoomValue === this._options.zoomValue) {
          this.zoom(200);
        } else {
          this.resetZoom();
        }
        touchTime = 0;
      } else {
        touchTime = 0;
      }
    };

    assignEvent(imageWrap, 'click', onDoubleTap);
  }

  _getImageCurrentDim () {
    const { zoomValue, imageDim } = this._state;
    return {
      w: imageDim.w * (zoomValue / 100),
      h: imageDim.h * (zoomValue / 100),
    };
  }

  _loadImages () {
    const { _images, _elements } = this;
    const { imageSrc, hiResImageSrc } = _images;
    const { container, snapImageWrap, imageWrap } = _elements;

    const ivLoader = container.querySelector('.iv-loader');

    // remove old images
    remove(container.querySelectorAll('.iv-snap-image, .iv-image'));

    // add snapView image
    const snapImage = createElement({
      tagName: 'img',
      className: 'iv-snap-image',
      src: imageSrc,
      insertBefore: snapImageWrap.firstChild,
      parent: snapImageWrap,
    });

    // add image
    const image = createElement({
      tagName: 'img',
      className: 'iv-image iv-small-image',
      src: imageSrc,
      parent: imageWrap,
    });

    this._state.loaded = false;

    // store image reference in _elements
    this._elements.image = image;
    this._elements.snapImage = snapImage;

    css(ivLoader, { display: 'block' });

    // keep visibility hidden until image is loaded
    css(image, { visibility: 'hidden' });

    // hide snap view if open
    this.hideSnapView();

    const onImageError = () => {
      snapImage.src = _imageNotAvailableDataURL;
      image.src = _imageNotAvailableDataURL;
    }

    const onImageLoad = () => {
      // hide the iv loader
      css(ivLoader, { display: 'none' });

      // show the image
      css(image, { visibility: 'visible' });

      // load high resolution image if provided
      if (hiResImageSrc) {
        this._loadHighResImage(hiResImageSrc);
      }

      // set loaded flag to true
      this._state.loaded = true;

      // calculate the dimension
      this._calculateDimensions();

      // reset the zoom
      this.resetZoom();
    };

    if (imageLoaded(image)) {
      onImageLoad();
    } else {
      this._events.imageLoad = assignEvent(image, 'load', onImageLoad);
      this._events.imageError = assignEvent(image, 'error', onImageError);
    }
  }
  _loadHighResImage (hiResImageSrc) {
    const { imageWrap, container } = this._elements;

    const lowResImg = this._elements.image;

    const hiResImage = createElement({
      tagName: 'img',
      className: 'iv-image iv-large-image',
      src: hiResImageSrc,
      parent: imageWrap,
      style: lowResImg.style.cssText,
    });

    // add all the style attributes from lowResImg to highResImg
    hiResImage.style.cssText = lowResImg.style.cssText;

    this._elements.image = container.querySelectorAll('.iv-image');

    const onHighResImageLoad = () => {
      // remove the low size image and set this image as default image
      remove(lowResImg);
      this._elements.image = hiResImage;
      // this._calculateDimensions();
    };

    if (imageLoaded(hiResImage)) {
      onHighResImageLoad();
    } else {
      this._events.hiResImageLoad = assignEvent(hiResImage, 'load', onHighResImageLoad);
    }
  }
  _calculateDimensions () {
    const { image, container, snapView, snapImage, zoomHandle } = this._elements;

    // calculate content width of image and snap image
    const imageWidth = this._options.imageWidth ? this._options.imageWidth : parseInt(css(image, 'width'), 10);
    const imageHeight = this._options.imageHeight ? this._options.imageHeight : parseInt(css(image, 'height'), 10);

    const contWidth = parseInt(css(container, 'width'), 10);
    const contHeight = parseInt(css(container, 'height'), 10);

    const snapViewWidth = snapView.clientWidth;
    const snapViewHeight = snapView.clientHeight;

    // set the container dimension
    this._state.containerDim = {
      w: contWidth,
      h: contHeight,
    };

    // set the image dimension
    let imgWidth;
    let imgHeight;

    const ratio = imageWidth / imageHeight;
    if (imageWidth > contWidth) {
      imgWidth = (imageWidth > imageHeight && contHeight >= contWidth) || ratio * contHeight > contWidth ? contWidth : ratio * contHeight;
    } else {
      imgWidth = imageWidth;
    }
    imgHeight = imgWidth / ratio;
    if (imgHeight > contHeight) {
      imgHeight = contHeight;
      imgWidth = imgHeight * ratio;
    }

    imgWidth = Math.max(imgWidth, 20);
    imgHeight = Math.max(imgHeight, 20);

    this._state.imageDim = {
      w: imgWidth,
      h: imgHeight,
    };

    // reset image position and zoom
    css(image, {
      width: `${imgWidth}px`,
      height: `${imgHeight}px`,
      left: `${(contWidth - imgWidth) / 2}px`,
      top: `${(contHeight - imgHeight) / 2}px`,
      maxWidth: 'none',
      maxHeight: 'none',
    });

    // set the snap Image dimension
    const snapWidth = imgWidth > imgHeight ? snapViewWidth : imgWidth * snapViewHeight / imgHeight;
    const snapHeight = imgHeight > imgWidth ? snapViewHeight : imgHeight * snapViewWidth / imgWidth;

    this._state.snapImageDim = {
      w: snapWidth,
      h: snapHeight,
    };

    css(snapImage, {
      width: `${snapWidth}px`,
      height: `${snapHeight}px`,
    });

    // calculate zoom slider area
    this._state.zoomSliderLength = snapViewWidth - zoomHandle.offsetWidth - 34;
  }
  resetZoom (animate = true) {
    const { zoomValue } = this._options;

    if (!animate) {
      this._state.zoomValue = zoomValue;
    }

    this.zoom(zoomValue);
  }
  zoom = (perc, point) => {
    const { _options, _elements, _state } = this;
    const { zoomValue: curPerc, imageDim, containerDim, zoomSliderLength } = _state;
    const { image, zoomHandle } = _elements;
    const { maxZoom } = _options;

    perc = Math.round(Math.max(100, perc));
    perc = Math.min(maxZoom, perc);

    point = point || {
      x: containerDim.w / 2,
      y: containerDim.h / 2,
    };

    const curLeft = parseFloat(css(image, 'left'));
    const curTop = parseFloat(css(image, 'top'));

    // clear any panning frames
    this._clearFrames();

    let step = 0;

    const baseLeft = (containerDim.w - imageDim.w) / 2;
    const baseTop = (containerDim.h - imageDim.h) / 2;
    const baseRight = containerDim.w - baseLeft;
    const baseBottom = containerDim.h - baseTop;

    const zoom = () => {
      step++;

      if (step < 16) {
        this._frames.zoomFrame = requestAnimationFrame(zoom);
      }

      const tickZoom = easeOutQuart(step, curPerc, perc - curPerc, 16);
      const ratio = tickZoom / curPerc;

      const imgWidth = imageDim.w * tickZoom / 100;
      const imgHeight = imageDim.h * tickZoom / 100;

      let newLeft = -((point.x - curLeft) * ratio - point.x);
      let newTop = -((point.y - curTop) * ratio - point.y);

      // fix for left and top
      newLeft = Math.min(newLeft, baseLeft);
      newTop = Math.min(newTop, baseTop);

      // fix for right and bottom
      if (newLeft + imgWidth < baseRight) {
        newLeft = baseRight - imgWidth; // newLeft - (newLeft + imgWidth - baseRight)
      }

      if (newTop + imgHeight < baseBottom) {
        newTop = baseBottom - imgHeight; // newTop + (newTop + imgHeight - baseBottom)
      }

      css(image, {
        height: `${imgHeight}px`,
        width: `${imgWidth}px`,
        left: `${newLeft}px`,
        top: `${newTop}px`,
      });

      this._state.zoomValue = tickZoom;

      this._resizeSnapHandle(imgWidth, imgHeight, newLeft, newTop);

      // update zoom handle position
      css(zoomHandle, {
        left: `${(tickZoom - 100) * zoomSliderLength / (maxZoom - 100)}px`,
      });
    };

    zoom();
  }
  _clearFrames = () => {
    const { slideMomentumCheck, sliderMomentumFrame, zoomFrame } = this._frames;
    clearInterval(slideMomentumCheck);
    cancelAnimationFrame(sliderMomentumFrame);
    cancelAnimationFrame(zoomFrame);
  }

  _resizeSnapHandle = (imgWidth, imgHeight, imgLeft, imgTop) => {
    const { _elements, _state } = this;
    const { snapHandle, image } = _elements;
    const { imageDim, containerDim, zoomValue, snapImageDim } = _state;

    const imageWidth = imgWidth || imageDim.w * zoomValue / 100;
    const imageHeight = imgHeight || imageDim.h * zoomValue / 100;
    const imageLeft = imgLeft || parseFloat(css(image, 'left'));
    const imageTop = imgTop || parseFloat(css(image, 'top'));

    const left = -imageLeft * snapImageDim.w / imageWidth;
    const top = -imageTop * snapImageDim.h / imageHeight;

    const handleWidth = (containerDim.w * snapImageDim.w) / imageWidth;
    const handleHeight = (containerDim.h * snapImageDim.h) / imageHeight;

    css(snapHandle, {
      top: `${top}px`,
      left: `${left}px`,
      width: `${handleWidth}px`,
      height: `${handleHeight}px`,
    });

    this._state.snapHandleDim = {
      w: handleWidth,
      h: handleHeight,
    };
  }
  showSnapView = (noTimeout) => {
    const { snapViewVisible, zoomValue, loaded } = this._state;
    const { snapView } = this._elements;

    if (!this._options.snapView) return;

    if (snapViewVisible || zoomValue <= 100 || !loaded) return;

    clearTimeout(this._frames.snapViewTimeout);

    this._state.snapViewVisible = true;

    css(snapView, { opacity: 1, pointerEvents: 'inherit' });

    if (!noTimeout) {
      this._frames.snapViewTimeout = setTimeout(this.hideSnapView, 1500);
    }
  }
  hideSnapView = () => {
    const { snapView } = this._elements;
    css(snapView, { opacity: 0, pointerEvents: 'none' });
    this._state.snapViewVisible = false;
  }
  refresh = () => {
    this._calculateDimensions();
    this.resetZoom();
  }
  load (imageSrc, hiResImageSrc) {
    this._images = {
      imageSrc,
      hiResImageSrc,
    };

    this._loadImages();
  }
  destroy () {
    const { container, domElement } = this._elements;
    // destroy all the sliders
    Object.entries(this._sliders).forEach(([key, slider]) => {
      slider.destroy();
    });

    // unbind all events
    Object.entries(this._events).forEach(([key, unbindEvent]) => {
      unbindEvent();
    });

    // clear all the frames
    this._clearFrames();

    // remove html from the container
    remove(container.querySelector('.iv-wrap'));

    // remove iv-container class from container
    removeClass(container, 'iv-container');

    // remove added style from container
    removeCss(document.querySelector('html'), 'relative');

    // if container has original image, unwrap the image and remove the class
    // which will happen when domElement is not the container
    if (domElement !== container) {
      unwrap(domElement);
    }

    // remove imageViewer reference from dom element
    domElement._imageViewer = null;
  }
}

ImageViewer.defaults = {
  zoomValue: 100,
  snapView: true,
  maxZoom: 500,
  refreshOnResize: true,
  zoomOnMouseWheel: true,
};

export default ImageViewer;

var _imageNotAvailableDataURL = 'data:image/png;base64,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z8GAqR8QqY2qD1rZp+l0UopeciSS9PDH99Aa1kFHGyUe8Mioza6t9b4oR2AbyzA2/FZLGMjqre1ygfb3I1JVPzpI6S0E69ApKrSWRhUbD3R31oEyGkSjGRSkTspQr/oRBiSQd/0MkzZdRgUCqSOdG/7mItXQiwAN+p7CaFFHN3nqLiENQlLorLC/OUPWhi2WqNVs2t5K/rEpjxDXt4v6L/4d/qcf+DcuhNWi18P/A6lLrbWjPVPiAAAPqmlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4KPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iWE1QIENvcmUgNC40LjAtRXhpdjIiPgogPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4KICA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIgogICAgeG1sbnM6aXB0Y0V4dD0iaHR0cDovL2lwdGMub3JnL3N0ZC9JcHRjNHhtcEV4dC8yMDA4LTAyLTI5LyIKICAgIHhtbG5zOnhtcE1NPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvbW0vIgogICAgeG1sbnM6c3RFdnQ9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZUV2ZW50IyIKICAgIHhtbG5zOnBsdXM9Imh0dHA6Ly9ucy51c2VwbHVzLm9yZy9sZGYveG1wLzEuMC8iCiAgICB4bWxuczpHSU1QPSJodHRwOi8vd3d3LmdpbXAub3JnL3htcC8iCiAgICB4bWxuczpkYz0iaHR0cDovL3B1cmwub3JnL2RjL2VsZW1lbnRzLzEuMS8iCiAgICB4bWxuczp4bXA9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8iCiAgIHhtcE1NOkRvY3VtZW50SUQ9ImdpbXA6ZG9jaWQ6Z2ltcDo2ZGFhMGY4Mi1mZmEzLTRmOWEtYTkxZC0xODllZGQ4MWFkZDAiCiAgIHhtcE1NOkluc3RhbmNlSUQ9InhtcC5paWQ6YmU4MGI2YzEtZDU0MC00MGVhLTgwYTktYzhhZWQ5NGI5OTFmIgogICB4bXBNTTpPcmlnaW5hbERvY3VtZW50SUQ9InhtcC5kaWQ6NDMxNDRlZTAtOTRmYS00YjA2LWE5NWYtNGMyNWU1ZGMxOTcwIgogICBHSU1QOkFQST0iMi4wIgogICBHSU1QOlBsYXRmb3JtPSJNYWMgT1MiCiAgIEdJTVA6VGltZVN0YW1wPSIxNTU5ODM2ODQyNTE1MjYyIgogICBHSU1QOlZlcnNpb249IjIuMTAuNCIKICAgZGM6Rm9ybWF0PSJpbWFnZS9wbmciCiAgIHhtcDpDcmVhdGVEYXRlPSIyMDE3LTAxLTAzVDE2OjA4OjUyWiIKICAgeG1wOkNyZWF0b3JUb29sPSJHSU1QIDIuMTAiCiAgIHhtcDpNb2RpZnlEYXRlPSIyMDE3LTAxLTAzVDE2OjI3OjE4WiI+CiAgIDxpcHRjRXh0OkxvY2F0aW9uQ3JlYXRlZD4KICAgIDxyZGY6QmFnLz4KICAgPC9pcHRjRXh0OkxvY2F0aW9uQ3JlYXRlZD4KICAgPGlwdGNFeHQ6TG9jYXRpb25TaG93bj4KICAgIDxyZGY6QmFnLz4KICAgPC9pcHRjRXh0OkxvY2F0aW9uU2hvd24+CiAgIDxpcHRjRXh0OkFydHdvcmtPck9iamVjdD4KICAgIDxyZGY6QmFnLz4KICAgPC9pcHRjRXh0OkFydHdvcmtPck9iamVjdD4KICAgPGlwdGNFeHQ6UmVnaXN0cnlJZD4KICAgIDxyZGY6QmFnLz4KICAgPC9pcHRjRXh0OlJlZ2lzdHJ5SWQ+CiAgIDx4bXBNTTpIaXN0b3J5PgogICAgPHJkZjpTZXE+CiAgICAgPHJkZjpsaQogICAgICBzdEV2dDphY3Rpb249InNhdmVkIgogICAgICBzdEV2dDpjaGFuZ2VkPSIvIgogICAgICBzdEV2dDppbnN0YW5jZUlEPSJ4bXAuaWlkOjEzZjk0MWY2LWFkZDYtNDk2Yy1iOThjLTA5YmU4NGNhNDQyZSIKICAgICAgc3RFdnQ6c29mdHdhcmVBZ2VudD0iR2ltcCAyLjEwIChNYWMgT1MpIgogICAgICBzdEV2dDp3aGVuPSIyMDE5LTA2LTA2VDE3OjAwOjQyKzAxOjAwIi8+CiAgICA8L3JkZjpTZXE+CiAgIDwveG1wTU06SGlzdG9yeT4KICAgPHBsdXM6SW1hZ2VTdXBwbGllcj4KICAgIDxyZGY6U2VxLz4KICAgPC9wbHVzOkltYWdlU3VwcGxpZXI+CiAgIDxwbHVzOkltYWdlQ3JlYXRvcj4KICAgIDxyZGY6U2VxLz4KICAgPC9wbHVzOkltYWdlQ3JlYXRvcj4KICAgPHBsdXM6Q29weXJpZ2h0T3duZXI+CiAgICA8cmRmOlNlcS8+CiAgIDwvcGx1czpDb3B5cmlnaHRPd25lcj4KICAgPHBsdXM6TGljZW5zb3I+CiAgICA8cmRmOlNlcS8+CiAgIDwvcGx1czpMaWNlbnNvcj4KICA8L3JkZjpEZXNjcmlwdGlvbj4KIDwvcmRmOlJERj4KPC94OnhtcG1ldGE+CiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAKPD94cGFja2V0IGVuZD0idyI/Pqg+M00AAAAGYktHRAD/AP8A/6C9p5MAAAAJcEhZcwAACxMAAAsTAQCanBgAAAAHdElNRQfjBgYQACoxsgNWAAAgAElEQVR42u19f4wk1X3np6uqq7q7uqtnZnctVovFakEQhMACYQtkLAgh9tUiQLuxEXsBmRCOjXCMZZ8dyRe4cLEvPsGZyNw5Mj58R4Jza7EOyDjwgoXttSDBsiOQsYizFia7Ctxi7zKz/aOqq7p+9P1R79vznbfV0z3LmuzOvo/UmumZ7qpXr9771Pf3F9DQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0Fg7KnoKNE5VCCEs/t73/XTCZ0zf92M9Y5rYNDROSiIrIy/5P1f+agLI5O/xpM9rrG9Yego0TjFycwGkjLxMAI7v+11FijP1bGmJTUPjVCA1Rz6MZ5bEtCqqJTYNjZMd2Srk5ci3aclnMz11Ghoa60G60w9trYpqaJz8RMXVT2lrI0dBDMCT0lqoqqmrOR00NLFpaJwMBOcCOBvABQDOkYRmAjgE4HUA+wG8qjgTGvReQxObxju7YR/qdrt3GIaBPM/hed5XAXwMWI7Pkpt0exAE38qyDKPRCNVqFUmSoN1uH/F9fxNJJ0wVc3zfD+T3Pd/3u0KITb7vHxZCbB0MBv9Cx8rzHIZhAABarVaVzs2O6ci/xUIIlx3XAnBFp9P5/mg0gmVZGI1GaLVa/xnAfQCyWSQmGh8RGDv+AoBNAP4oTdPbwjCEaRZOz9FoNP5ZqVSQ5zksy0Kj0fg2gC8AeIUdk49/k+/7h9m5D/T7/bNoDrIsg2mayLLCPFeprL5V6P+j0Qie590A4Gl+H7TE+M7C0FNwCj+VKhVUKhUYhoHRaLRRCHFJyWYabygmtZCH8KrRaDQmhxlgSVJw6LhCCEeeZ5dpmnAcB2maEvHcLIl11k2dCSEsFpMGIcRFAD6bpuk/h2F422AwgGmaGI1GSJIEcRwjSRKMRiOEYQjDMJCmKbrd7nV5nv8DgK9xQsOykyGU56IHwPico9EIhmGgUqnANE1YlgXDMKa+TNNEtVqlw1C4ialJTRObxgxQyahSqWAwGADATmVTTUIof+5ai41rwr88SUS3E9EmSQLTNNHr9c6VKuNMIAnN9/3A9/1ACHENgPvjOP50kiTI8xx5niPLMhiGgXq9jmaziVqthmazCcuyYFkWqtUqRqMR+v0+wjD8MIAnhRBnKja3QM6To85tkiTj93ROmvNJLxqflHgXACzIOdMe2X8DaM/RKSqp0SakjZ6mKRqNxnYAd6uqD4/lkhJWLITYBOAqrsZNgUmSHpPaSPrb3u/3DRpLtVpFlmUYDocAsFMIsd/3/cUpxOn4vh8ztXsrgHs7nc778zxHmqZwHAetVguGYfwQwOMAngbwr/IQ71pYWPgtADujKPpgkiRwHAej0Qi9Xu+DrVbr9wB8TpK6wyTZmMJFaB5qtRoajcbfS3sdSb21WecHwD4AhxWTgIYmNo1ZyI0kiTzPiZgulpLJm1y9U35acgO+JwxDmyQSslmtAkfa58a2L3bcT9FxqtUqPM870ul0Nkq1bDeAPQAWp0hrMbMBLgC4JwiC9+d5Dtu2Ua/XUavVvgPgfgDPqQG3QojM9/2HhBB7arXatbVa7bO9Xu9CIthWq/UZIcT3fd9/XghBF5sx2+H4QeA4DgA8BOBbjKym7RVSc+d9339dITytimpi05giFSzbEZhtZzQaIYoi1Gq1G+SmBHckkCQkVTwHwI4kSVCpVGDb9thIvpr9q4SILAAXRVF0GZGt67o/B/D1SqXyp4ZhoNvttjzPuwrAizNcnwegC+CSLMtuGw6HcBwHSZLAdd2/BPC47/vPkoQnPx8z1Roowj32CCGCVqv1rX6/j3a7jaWlpdb8/PyNAJ5nY1+hnhuGMZ8kCanSi2WOjCmqeirHz0NMtCqqbWwaM5CLRSRCxvpardCS0jQluxmpiY6qlkpsBXALGckbjcabM5w7ZsRIpNAAcHMURWMnBoBHAOzxPG8sVUqpbRa8KY99axiGsCwLeZ6j3W73fN+/1ff9JyVpeJLUQt/3u77vp3JcCwDm5TifBPBfyakgbZLXy+/SQ8IkkgbgkI1QjvkY298UiTOVqnSXVH+9XDWxaawB5DgwTROmaQ5t284B0IZ8PyM2k0kUC4yQNnU6nValUiEv3r5ZNi7zVnpM4r+BSE0S2z7f918F8EOSBjudzrnTjs8knCviOP5dIl0pSe7mHkxJZoeJZJm9DzKMZZN8+5VGowHDMEgqPQvAuyZoLA5dg5xfUwjhHY+NjEtq2iOqiU1j9Y0/DpugWLMsy5BlmQ3gpkqlgjRNyWC/WwixwOxV8H1/kW2yB8lzGMcxADw4w/kXmOTSlWTykX6/v4U+47ruQaZyft4wDCRJAsuyIIR4galsEEI48qVW47iWPIwA0G63/xHAk4xc6XtEZg2mWnYZuTkAXNM0b2y1Wv+p2Wy+zzTNmu/7r0rVMlakTwAAqecoQlu6x3GfLLpXRMbagaBtbBoz2LjIaSDV0QGAA6ZpwjAMDAYD2LZ9he/7XygjRynNvZtCEzzPA5Y9i6tJIYuK9LYJwCdILY6iCK7rPsDG+WqtVhtmWWYPh0O4rnuBEOI83/f3UxhEmeEewHmKl/ZlqQaTEZ6cH+M1TB5V1QYIYL8Q4oCUMMefmaBapuSEkY4Ul1UTSblUOGF+eNByyomYjq+XsCY2jXL1BgBMJY5tEcB+13V7cRy3ZDzbdrbZua3HAfC+JEk2UmQ9gG/6vv/6Y489NpM0guVMhrOjKDrfcRzEcYxWqwUAe5nK+gsAe7Is+6hlWQjDsNVoNG5EEXLBU5wsIUTGCPFyhdieZQQRQ5YsYoTYlWoj2bUsRiSZnIPDnJh4ALD8bgYgG41GsG0bjuPk0n74bgCLQohZSx5tAhCwc8RS8gv0CtbEprE6sYztbJLcyGD9yGg0+rgMjEWr1boKwDM4tnzPdql+Enk8MuO5Xam6EVHuIgknSRI0m83/wSUpST4PVCqVjzqOQwHEvy+E+AJWejFTTtxRFG0k+5rEvgkE78gQj1QIQUSZ8jHw+eKe0DKiEUJ08zzfmGUZ3nrrLaPVan2FQliY/XIivvnNbyKKIggh/oPv+w+zdDC9cDWxaUwhNZMREm02kkQezfP8447jkJ3tVklsXZaD2QCwkwhJelOfFUJYvV5vLWPZPBqN7szzHIPBAPV6HQC+zD5CgcAvCyGWjh49Om9ZFvr9/lnNZvMy3/efV8iS7G5Wp9NRJdVDREZKqhjPP71FCNGV0lIsCc6R0iAZ8hsogmxfITsgIz4P0itq2zbSNOUBxuPUtdXAsg5W5OVCx7H9m0A7D049VXS80aTERob0l8kDKDfhTmnT4lLMe6IoOovFv/1AqmqNGc4fMHX2vd1uoUnKhPMf+r6/3/f9RUlWPH7r80DhwY2iiEiI9ydYgSkk0gDQYClRkAHJ9wdB8FdhGP7NYDD42yAI/q7f73+r3+//TRiG34qi6G8Hg8FjaZr+FQrHylbywsqxdgE0RqMRsiwb556S1DhNWgMAptrTfJGqnSmqr4aW2DTK7hmLGYOiav1llmUflU4Eu16vXw5gPzOs75DOBfra10jCWoPU6AL4BBGr67okoX0ERemg3xBC/EoSbg2A6bouhsMhhZbcCuBRAM9jOTZuTNq2ba/I1ZROiiWFoE0hBH3P6na7ddM0V+R0EhmpRGlZVgqW7iSPsQlARjFsMqXqe1j28DZm2CukCh+QROYB6Crqu4YmNo0ywaBEsokZcX09TdOPsnI7lwghHpc2OAfANVmWcWnvKXIyzOI8kGTgdbvdqwFgOByiXq+j1+tdadv2lcPhcFzqh8JJSK0DgFqthk6nY7fb7QuwnAGwwqNZrVaRpimXkjYTadDnWNbBIoDDlmWNwzTUbAzuaJHHrGHZ2UBYhHTKZFlGKVWPA3iYUr0Uu+BEiZJJatyOtyBJX0Orohol0hIAxEQYJSrSobm5uSXyKoZh+HHK7wRwTq/XO9eyisO4rvttGcLhlKmCSmCpydSpT9m2Ddu2x+Elo9FobI8iEkuShDIhYJrmuPqFlBbvZUG0PLg2NU3zp1ziAnANXT+zscXcbtVoNH673W7/pud5v91sNm9wXfd3XNf9zWaz+TutVus7VHqIxgilyq48XkahHlJiPEAhHLNKtPzBo8ToHdYrWEtsGsePV1F4EXeQMVsIcY3v+88KIa4n+5skn6fkxgtVlW00GqllijK5yRcA7KKaaJVKBY7jUKDwqgNrNpsAgMFggFqtdkalUjlPqoRdRgYugGcqlcqFLJ5sl+/7DyjkPrZhSVXvVd/3D7BjmJLQPQDXDodD1Go1ItVfsbxZXsBzRfCzVKXJYZNOyyCgz3IJVGcdaGLTOAESnSSfJyzL2jEcDmmT3gzgWQC7KV1I/n0vlksZuf1+f0xqXIJSNuhvhWHYsm0blUoFjUbjIIqshUNSXVwNd/V6vQ8CQL/fR6vV2imE+DGODdR9zLKsT1PGQhiGlwohLocM1FUyFTypih8gL6QSyhEDiCqVCuI4JqKkQpapEtS7Qs1nqnc4C0GVfDZT51FDq6Iaawd5Nr/faDTGxRghvaNBEJxFMWe1Wu2nMsWKNvYsZbtdALckSTKuUivJ8WHf9/egCC1Z7fU5MszLOLrbJTHN00NWjuelWq12kNRaqT7eLYtPUhiHJ1OiDpPEyct/M7V5AUDWaDS4XXFFFgJDSvXkpBpsKtc+bX7UzARzWraChpbYNKYjlGrQ60KI71UqlatlFdlWs9m8K45jNBoN2rRfVkoZxXv37p0kBRLpnZll2XVENlKte4w5JrIpEs3zQohhEAS2aZo0rhuwHCAcM8nngWaz+aVOp4N6vY4oirYLIW5FUbaI4tWIcBoyhg0oPLYpU28XAJwdxzFs2+Z2u7Ig3ox7UsGS2JXc1FWlNnV/Se+tbtasiU3jeKCkHT3uOM7VeZ4jjmM0m807SWKRwbRPSklpbNQm7yHZmHj1V0kgu/v9/rgqbb1e/6nv+z8mYpxxmPcPh8M/pr4IAO7yff/hkgY0f1GtVq8xDOM6in+rVCr/x3GcDwghHkARwpJKtVNVPams0VUAbk+SZPtwOFTjzBr8e5S9QM1xZFgKdy4Ex3E/Yqk6O7r9nyY2jbdHbrQBn3Fdd9jv923DMNDpdMaEVavVXvJ9/xDVJaNNp/ZQUNSpxmg0+iSFUUjJ5hGyVc1CbpK0Hq3X63/MPKcXknODzsdCOu5bWFjwkiS50jAM9Ho9JElyW7PZ3AFgrxBiD4qQkVQIcR6AAyhCQ96LIt1rB2Ux1Ot1DAYDSvh/GUXQ7IpS5AAs8p7KsuLXCiE2S7K0AHSmTD+pq44cyz55/Lgk0V9DE5vGLGC9DBxZmucXhmGcTylCjLD2yc90uURGmQRK1D95BZ2jR4+iVqshDEOK83qQSVnmtNI8kkD2CyFeW1pa2kbe2Wq1ehdkWhcjtc1Sdb3LNM2fjEYjNJtNxHGMXq83b1nWHaPR6I5arQYhxEGpNm5LkgSDwQDkOKlWq+NcVs/zYBjGt6X6vMjHK3+PSaLr9XpwHOcOsvMp4SeloO/KTlXfQxEbt1aJVuMEQfcVPXmI6aEoiu7odDqo1Wpot9tf9X1/N9t4jgxtuCWKor8KggC2baPVar3p+/5mIjcsl/XZFQTBX6VpCsMwqO4/bNv+Dd/397Pzur7vB0888cSICBAAms1mk6UtvRjH8cVBEMAwDMzNzf0lgM9iOYJ/YYZmLRTkurvf7//PwWAAx3HgeV4PwJmY0MEdwEUALun3+/+Lq8wUq0dSJA88pvAT0zTRaDRQrVYHvu83poyvG8dxS6Z9HZPZMQ0k8RqGgWaz+RqAy2RdOK2GaonttMaCbdtot9skEVEcVoYipIGSwB3LssYNTgC8zvIeY2ZnOuS6bh7HsZFlGTZs2HAERZxbt0x95TFs8vzzMhXonCzLLs7zHPV6HfV6fQjgBUpOl5hakJF5LV9pNpsHHcc5SxJQyzTNWwA8xEsPkRdUCPEqgKDZbP57ANdKwjaI1NI0pRp0Y6mqWq2i3W4PUWQPPIIZKgSTKknzwOdjhg5e4xxdaZ9bBNAm4tdLW0tsp7PEdh6AS5id5mXf919kFTAcFgl/vfwMeRL3TLBp3YzCSG7Jzx/yff8Zrr4SiQghdkmCWgAQ+L7/OPvc7VguCdRF0SWqu8br453dr0WRn2mhCL94FMASu3ZIMi+T4M4AcDmKjIRL5Hgp3/OfUMTsPY+iisfirGqgEOK98lhloR2zNGVZwHJbv/E8KzXsNDSxndYkZ7GoeCK0UpVGLf0Dlq/ISuegrMqsEqXvMBuXBZn4TfaoEpJxucQ3wzUtoEgKTyeNfzXpRh0/EQYnQaXYZHo8ti3FVmhixi5TU8buamLTxHa6kpmD5d6dDpYj8sdR8iyWypGbmRK0MyYNlRHAPGSFjAlR97xVn6cSHSOmQCnYmK6RMByVxORx0zIJkNegY6S7JkJd4/xnb6PJsUqylBWhHQfaxnb6gtvHlM3Ay3tn3F4lEWJlIntWIkkcZiEHvGP5ig7skjQcfhxGSItl0smsqpY8PtQeAKrTQSEVh5H6ZmmzGhdylGpjwBL9x2rjcdi2spIUsrUgLbun2nmgcdqrn/LllkW5K92d3ElShWwZ57DqGWWSyVjykW35nAnHcSeMwWXfd47jOp0SEjvm2pQKGSvmadb5PB4VVP3ujOdz1Dk6nvnR0BLbepPY6Kmess3vYLkOmMNUSK6WkRPBlJJcSAnZTLLhgaIZO17A1SUlbCPEsRVuaQzcpqd2jVrVRkaSG9mwKFuCXz9P9ZLkNp6jMmmRSaFvV+pacZ1MCnNm6F1A96GhNH+xqDeDXuUaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoapxB45HtZRL/86bG/8ch6V63rXxZtT5kAE77rKZ9bKMtcmJRZwcdJY1WOuSB/blY/u8o8eHplnJ7QSfDrj+B40vwxVSVKqnis6K/JeidYvFxSCXmME8aV/pwoKzc0KfKeKoxgOdMhK/n+OFFeqWZiooj4n1gEYBJJq9CZAZrYNE5OQltAkdIzTlhn+aJdAOcA+JX8nadVUdNhSs/qYmXvgU3y854kl9cVQrKwsjEKpW65yjhcFJVyN8vvpCiaybwyrdKs+j9ZOvxQGfnJ83SxnGZGFVDiKcSmq3BoYtM4RVTTBwF8AMt1xfag6AN6iFQ21ichVr7rArgCwD2SjF5F0QjlbpSX8R6XXWJq71YUVW9vD4JgG/UPoC7y1BXKcZwcwCcBfNf3/Ve4OirH2GXVPFIAT0sSJlW3oRA2SXKUx5piSl607/tn61WzfqCT4NcPkam1yzwAH+j1eufneY40TbFhw4Z7pdT2kCKhUJK3JVU6kqg2x3F86WAwgGVZW5rN5lYAD2A5MR+KpMYJaTeATwwGgy1RFFHJ7HGZ7TzPeYMUI8uyLzUajZ/L7lN7fd9/RRLaApEbinLp7nA4vDQICiHRsixkWQbLss4AihLd1HyF90bgXbg0tMSmcWpLbC/3er1zAYwbnGzYsOHnAG6mnqCr2cCEEDvjOP6bJEkAAM1m8yCA85Sij6Zi4zoPwOcHg8GH+/0+TNMcd3AyDGPcJIWIjQhIkhPa7TYMw/jfAO6jpjO8zR+AzcPh8F/6/T6o90Oe50iSBKPRCJZlrWj0Qs1sphHbjTfeqPeCJjaNk1RiAysYaQL4p263u6VSqcCyLJDk1Gw2vwngk7JrvMOq4lKF2wVZEnxXEAT/lyQf6ojFjPGmosJuBfBgr9e7Ls9z1Gq1MWm5rvv3AF5E0ZJuUaqP7wFwfZIkFwJAHMdI0xSu66JarX4DwOcV1dSSdrpHALyb2QkdeUwHQJxl2bm9Xm+s9jabTRiGcXCKKrpVryKtimqcZFAkrpj/HI1GSNMU9XodYRgiy7IPm6a5B8DrZIdS6qSNj0XqopS0MkaejlRhSW11AXwsiqLrZMNhRFGEdrs9AHAngGfJ8cCwVwjxlWq1+p40Tf/Wtm2MRiMcPXoUnufd5DjOyyiasvBrPCCEuBWymq7qyQXgmaZ5t+u6dw4GAzQaDRiG8TSAnXqVaIlN4xSV2pSa/a92u92zSC0jddS2bbiu+waAD/m+/woP32BqLABcNRgM/i5JElQqFbRardcAXFQWBiKEeG+/3/8RdXmXktJfALjX9/3DM4zdA/B8v9+/0DRNDIdD1Ot12Lb9Pq42zyK1Avhyt9u9wzAM5HkOz/PGPVo1Tg8YegpOD1B3dJK+BoPBFgB3yriwGOV9E1wiqhlI6b+Rl1N2bv8pgCcolGOGIWYAPtdsNg9GUQTbtiFte/ceZ3MVDU1sGuteNK9U0Gw2B0DhSIjjGKPR6E4AH5EfMUuIBqPRSO2KXhZrdkG/37+ajPbSA3q/7/vPlqjJk5D6vr8XwEPkbEjTFEEQbAdwnr6DGprYNI6B7O6+p9VqIUkSVKtV9Pt9ALhHCHEOVoZwmJKMYu7JVKQ5jsvJu5nnOVzX7aHowg41rWqKxAYAj3uedySKIpimiTRNAeC39B3U0MSmUSqxAXjWsqyv2rY9Vk37/f42AJ9VeVD+jImsViEiALjCcZxxjBqAZ1jaU2PWMcrP/wLAk3mew7IsWJYFFEG+Ghqa2DRWYjgcAkV0/r2u674k32M0GiGKotsAXFbyNTPLMpKaUKZWSjJ6H31GEtEz7LPdGW1kDutC9Zxt2zyw9ip9BzU0sWkcA0kQjsyx/PzCwgLIMSCj+P+LEOJyksYkGVlM2lPJbIw0TbcQscnzPMclu1ltbEx1fdGyLAyHQ4xGI4RhaOs7qKGJTeMYSEnKlGEaj1er1W9QqpXjOOj1elcDuJyTDFCEbcjvTkQcx2PpSnoyD7B/z1Q6iIWOOAB+kec54jiGZVmIY52frqGJTWM2AvnU3NzcDwGMU4+SJPmiEOIKpkZ6lIsp7WyUOM8bFztpmsI0TWRZNk6fWitYUv4iAEcmx48dHRoamtg0JoEb/A8DeHJ+fh7D4RCk+gH4c6mKbgVwKI5j5Hk+VkdL7GVmtVpVHQw8Jq47Yz00XiPOITIlwtTQ0MSmMU06oqT3RwH8tWVZqFQqGAwGiOP4UgBfQJFu5ZYQiyqSWfV6fUUCOopyRWCSnznruOSvZ/IMBtvWJjYNTWwak2FyiUrmbj7abDZ/TuEVSZIgjuNPowiKTSmBnjkQjpG+KpXKz4AiVk4S2+UKWc0qclH83PsogV3muL6mb52GJjaNSSBS4vmkzwO433Ec2LaNKIpIQnsEgBXHMSj0YoLElgL4/nA4RKVSIZX0KpZv2lhD2W0iwA9JwiRnxLf0rdPQxKaBEqkKTD2MIStzyDpqexzH+SYlyOd5jsFgcCmAz1iWpdrPLEVtjAHso8R1KbF9AMAFCllNhUzgfy+Aa4gkpUf2u/oOamhi05iFRAIsV9wNANzXarWWarXaOLyi3+9fWa1WQSW9sTJPlFfrfWF+fn4pyzJUKhWEYbgFwK1CiE1qM5nVIDtQfaLf79dJDW21Wm8A+Im+Yxqa2DRmJbeYWurJ0kCfGgwGIHKjGDIlQDdV1Fqy1e0xDAOVSgW9Xg8AdqFoIDMrqXkoikjuiqIIVHIIwFMA3tR3S0MT2+lLVCn9pN+p4oZEV1EjSVUku9kz7Xb723mewzCMcbltqucG1qyFS2LyeJ9qtVpv5HmOVquFt956ayOAfxBC7FTPSWSqkNoNeZ7/qNvtGrVaDUePHsWGDRsOAvjCGmx05HxIyZMqk/9dvTpOM9OLnoL1A16yW0pUrx49evQMCsNotVq/4/v+46ziRqwUl8wA7ADwYKfTOYMkMIpz8zxvCSvb5/H4MweFN/TpN954o+55HiqVCiqVClzX/QGK5i6vK4R4JoBLAFwQx/GfxXEMOqfrujmA3b7vPyyE8IhQZ5D6YgAP9Xq9jyZJglqthkaj8Q3f93fpFXL6QBfwW19wJFnFQogMQEhEIdU6ksyosCR1p+J9RJ8AcE69Xv+zwWAAx3F4gG4XRe5nzCQvIsTM9/19QojPbNmy5XODwWBe1nxDrVa7Moqif3ZdF0KIlwAcklLUOXEcb6HGLFSpd8OGDQBwn1RDMQupMaKOhRAxSanS+XBYLw2timqcukgVtS2lnEtp/K8xVTXAcm8Eh4hKfv9h27a/Ix0ByPOcB+k2mOo7Jkjp0VwA8DCAG+v1+kHLsigPFVmWIQgCRFF08WAw2B4EwZW9Xm8L1V3L8xy2bWPDhg09AH/o+/5nef/TGVXxcVIpNZGR496kl4aW2DROXWSsF8E8gMVarYYsy1Cv1wEgUoiASJDSnlwp9RwWQnzZ87xLOp3ORtM0KV/zMIB3ScltfE5SL1nn930AdjWbzdtROBHq1GqPPKwkBVLNtVqtNkDR0PlLvu+/rFyTO827yvqqOgAC6pAlJTZPLw1NbBqnKKTU5Ek1NAawp1arvcjUz5cUErAYYZhETBL7AHyq3W5fgeVu6vtRNFzm5wxUgpGE+QKAF4QQjzYajfei6BJ1znA43DgcDmHbNur1+gDA9+W4Hgewn/UnXZAkGwghZi1Wmckmy9+tVqtOtVp1JRk/p1fH6QXtPFgnYP1Bx4Z2IcQmRmoLvu8foM+isIs1UJQEN5Uk9AY7BjUrdrh0phIZ70tKxMQkOGqN50h1ubuK1OWsJfZt0lwAWCBCXoONTkND42QjNiIi8o4qIRX0N6+s2kZJCIbFX8rf+DlcOm7JuSze86DkuxYbd9n3Xf73Weeg5LocvUI0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDTeKZy2mQclQaoNLFe9oCoRx0Ths8h6isRPKQhVpv/wiHuKyp+17Ida7JAAAB+kSURBVI7DMwBYSSFXHptSoY7pri6zDJZYFoDJxufwBPEJ53bZ9YNdJ2UeZJiQFcCyHkrPw+fkRN23NdRoG48BQKCUWaIMjHTa/ExbP+o8K/fPU8/Dvz/LtbA14Mpx032wZsnUUMZW+vt6wmmfK8oTweXPWFmsvGZ/XDJ3KVhdM6xMEG/I99mMY5m0wHjzlaxkc5m+7x9Wrimd4bj83AG7nhXnZpvAVDfapONzslfm5LgJjc2xyebEmYWYVGKVn49XedBNWierkVFW9n+Zv/p291rKHp58vcUzjj8uG2fJ3GpiO8UktLInkymEMFVpQ7nR6YQbnwKwJPGZQogVlWuVhRbPunH5ZmXHjLmEyI5vsntIEqb5dp/AJKnKDRCrm4OkHdpgjOQsIUTGiNU5HunqOB5O8fGsA35fp42RS10l92EFmZVJc9M+P8McWexemER0a7nnLEeYnzOj9aaJbZ1IalICoWKLY5KSf8tIJVVUsnHlWL6oZF4jSU+04cM1DImkO5MkwJIS3mUSQsbGZ3IyWqvapqjXMfvdUiSQmEiXbTSUSInxr3HdxuweYg3Xx8nXlH9LZ1gvk6TOFVVS6BzK+xNNGpT/SvNrybW3GjKVTNnDVBvlTmWJjd1QZzUVhD5TkhTurPW7PIl8jTa/Y8bOjzfrMWdVgVb77FqOs9ZrOxEq6iyJ8ur9fAdttxPncy33UkNLbLNIRlw9nCfpRIrkXdVGxSSWlCQzKuYoSWeJ2bq6JLmROjaLcZc9Sc9E0ZWpAcCTHaAcrmqi3HngMamOHCBrKv9DBnAUhRlDJo0ssgcCl0Y8ea4lAGfIsY6JmEm1J4o0NpNNk8ZVYgedKOUwJ5DHrjGYZR+wa+Z9JVbchxKHAamPDrPFxmUOnhmvf0Eea5Hd52wNU5jK6wbZZNejfe10IzZaZDGWm/5eAuB6FA1KqJji80KIJyfZSyAN1XLhfgDAVSgqz0YAXhZC7JWGalVNm2XhfghFQcZUHnO/EOJ+uQH5dXAHgouiWu4fscUeyOt4ajVv5QRcA2A7ijLiHRRFIB9V1T553p0oGriQ6vuw7/svM9U8O4Gkdh6KarxUZ80UQjzt+/6zM6q8GSOHjwB4n5znrpwzd8r5H0dRZPN13/cPMRuXKx9CS1h2argomtf8hpxDF8Dn5LniSfdyBknwI3K+A7kmeDmmaZ24InnudwM4IIR4yPf9V9ejfe10IzYHy+5+MsZfAeCzS0tLdrVaRbVaheM4W1FUin1FbRknn7YxW0hX5Hn+8V6vh0qlAs/zfgrgx+yJulZp5Pooiu4YDofI8xxzc3M/A/AQ8+iVkeQ8gM39fv/jVHK70WigWq0uAHgRwAE51lmMywsAtg8GgzvjOIbruqhWq38thNhDhmZ2/ZsA7AyC4Losy+C6LkzTfAXAy1zCOYHYBeBPut3C1FWpVNBqtTYLIX4iyWHanNPmPRvALUEQvD/LMpimCfq5GobD4W3z8/M5gEeEEP/H9/3n6TqlxM9xNoA/6PV626hJjed5DygPKG6jm4VYzgCwq9PpXMlKnqs9XyeCWioOBgNs3LgRKCocv7qWB++phNOpmQt3AhCp39vv921Zzx9RFCGKoh0AAhl7Rt4sj6QQUjPkU/shwzDySqUCx3GwtLR0IYDzlM912ftxUUX1bwAW4ji+M01TGIZBG+0uvvCIVCg2Tv75TQDfNQwDo9EIpmkijmMkSfJRFEZmd5YYMnmdAQArSRIYhkEd4eMJ0sPrAC6i7u9RFIHIRS3suBY7X5m9Ur69/fDhw6jX62MyCoLgJqliLiq2NE+1T7L7tx/A5tFohGq1Ou56n6bpqi/TNJEkiXHkyJHb0jR9Tghxi6KWcu/sPwFwKpUK0jQl8tmK5dgzmu94VnVdqvlbDcOAYRjjMY1GI6RpOm5cM+kFYNxvYjAYcKIPeTFQTWynLogorkqSZF4uWABFZyPZzekWSUhkj+A2Db7ZXwfwd3mej5sLA7iWxXetaC7MFj4vsU2L+vo8z8eNTlqtVg/Av0Jpcsy+RyrMFWmatgCMr4M2FB/LqYAJsWKWEOLyJEm22LaNOI6RZRmIyAH8HiM0S85td5WHW0gSTJZlqFar8DzvCDWVmfSqVqvo9/uo1+tEhp+UkhneiQBXImguoVmWNZY0SeOY9KLGOY1GA/V6PQfgUun4U2mNaGKbIrkBuDUMw/FCaTabOZGbXLRQbBgrnsxSGgsAfM227fFmA/C7QojNvFS3skBdRXqkzXw7dXKSY3oUwAFmzzsmOFZu5FvCMBxLa67rcmL72FokppMB3HvN7sHtQRDAcRyMRqOx1Cbv1V2sp0JDlfiUCPtxPBm155Mq3aOu625Y7VWv179XqVRQrVaRpil6vd7FAK59B+c2A5DR+mi326hWq39Yr9ffddNNN1Xq9XpttVez2aw2Go2a67rvAnCe7/t7fN8/vB4dB6ebjY3Hn50DYGee50jTFK1WCyj6Yd4xGo3Q7/fnhRBXyQbAPDA2VGx2APBso9F4rdvtbqtWq+h0Omi32zcDeHCCXczkUeNSrbw8DMNtJLHVajUA2KtGi5e0oTsbwC5SB+fm5nIAj+V5fpNU1bYJIT7k+/4zp/B92wxgF0nT8l49kSTJDgAIw3Bjo9G4yvf9Z9bQ28ChJtLyIfL8NHVdCHHn3Nzc14MguJTsZgBulg+gd6IhswPAJHUyiiLU6/WYJPoZpcZUjnWFR1RnHpza4N6nHf1+36hWq/TU/h6KJsF3sMbAn0HRgg7SVmWSlET2EVI3hRAPVyqVPyMVB8AfAPhzudFCRRrJmARBi/F26oIue3j+TBp3CSGzqwWM3K7qdrt1sjmh6Mv5sGVZN5F6DOB2ACc9sSmR8FwtvSQMw3q1WkWSJKjX698B8IBlWTuGwyER08cAPEP2KjUwmVRU/nCpVCogcpM21WkpSfuFEHemafojUu+iKLq4Vqu9k3uoa9v2eJ0wm+ZMziEshwGlZSlqmthOQbBFvhnAjVmWwbZtUkX2AHip0Wi80el0tsgn8nZm/M+Y5GXKOLWQkdPj9Xr9z8IwhGmaiKJoW61Wu8j3/RcVErMU21oshLgAwC7DMMYeTQCPcaMyl/DYU/ZMANcnSYJarUYL/VsAnq/Vaq8lSbJN/u16IcR5vu/vPwVsn6kSF3YOgB2KQ+VJ3/efF0K8FgTBNmlbvE4Icabv+6+zB0DISO2YtLlKpQKacwDuLBKL7/s/3rt3L2g8Ut3vvhPqqHyojp0ReZ7Dtm1zjRke6Qykr4ntVAJ7Qr03TdNLaXG4rnsQwD65Ib5kGMZ9aZoiz3NUq9XdAO5X0k7GEoUQwpQL4xeWZX0bwHUAaMHfBeBWRU3guZa0kT4UhmGdJAjLsg4C2MvOMU59kYubvvuB0Wi0nYzozWbzTQAvyO98GcAXAWAwGNj1ev0WAHefSnY2OWcX5Xm+o1KpIMsytNvtN5kU/RXLsu4jL1+1Wr1RxtF1lYeBoz5MAMSkhkqJz51Rjf1AGIbIsgx5nsPzvCHK099+XbZHl0I9JCFbTAswZ9jrFKB7mO0H70RVXtHE9m8oEQB4z2AwQKVSIVXtxwD+VS7Mr1uWdV8QBKjX6wDwe0KIBylanJHNMRUlhBCPmKZ5XZIkFI7wUSHE7gnlYVwZze+i8Gpyb9cB3/df4ZKmDA8J2VPWAXBBv98HU0P3UeQ/gMdGo9EXyWZXr9d3nUrERioTgLMXFxdRq9VoI3/X9/1X5PXvsW37viiKSJK7FkU3eTUIlpf4oc0f53kO0zRp3tMZk8hvJWKRjosX3ik1TkqcMQDuEeZxldOS+OkYoUL869J5sG68ompzXfneURaGG8fxn9KCtm0bKCLEx/aGer3+TVJRe73e+SgyC455crL3dM5nXdf9R6DwuMmQgF3sOw41C2akdl4cxztGoxEMw4DjOCACmlQdRC7kTQD+eDgckk0OAO7hthjP856gzdvpdLYJIXaysfBGxydFDBPz/hIZAcB9FI4jTQZ3M09n13GcbyRJgizL0O/3rwZwDjvW1pK5ozAQr1qtjmPASPIpyQ32pId7qxBiz+Li4u9mWYY4jsmLfvuJThubggbF3sl77tEaLMs/VXJRLUVrcNX50cR2ciJG4Tm01Pds0d4KAMPhEEmSoNFovMFtV/I7P5J2MpISbmELnewRPLYsZpvmKdM0Qd5WFCkwwHJsVcokvwDATvJopmkKx3EOAvgFs+VZiuS2Sb69YTgcwrZtuo4jKNJ9wKo+vOS67jhWS0o0XC0P+PhPEnLryuyHrhDiruFwiGq1Ctu20Wq1fojCcZKyce9rNps8a4A/SA6rG5fNZ0iqqJR87kSRMbFfCPELIcQhAN3RaNQZDof/bzAY/Msvf/nLm5rNJgBgYWHhCIAdABbfYY+ilyQJ8jyngOjdMuXufgBfnvK6TwjxEIAvyPS0dD1rbeuG2Jin0lEWGw/XuFXGmpGq+TlKpJavRQBfd133TYpMB7BLEoqJ5Ti2sTdJUWH2tFotkAo4HA63CyHOKUlYp6fl71Oqi1SJ9sqMBiiqExRJZncURbAsi0JD7uZBqXJMf+c4zsE4jolkbxZCXCD/R/Fe3sni5lelawB/RFkBcm4e5JKL/LmvVqstUWBynue3SaeKQ9VmJ1xfTPM+Go3Q7XYv63Q65/Z6vW39fn9bGIZnhGFYD8OQsjiwsLCAwWBAJHqv7/tP0oNqDWEmbxeZYRiwbRt5niMMw8uCIPh0r9e7Y9qr3+/f2el07oii6NMALmJZLIEmtlOD3NSFPI4VC4LgUjL+1mq1N1F4Q0kaIzXxEBmoK5UKOp2OAWAXyxM12dM/45KA9Dx+AyiiwsMwBIpYp/HCZMG11wwGgzNIdfU8Dyi8mmWeKnJYvC6EuCiO4wvzPEccx3QdjzNyoM/+GMBex3FQrVbR7XZtFEnrKFNxTwJQxd1FIcTWMAy3EPlIT/GTVJHC9/2uvB/7ATxNwbqdTgcAdjKSNxUplRLUTbJpMs/oOPOEshLISZDnOZaWlmDbNgzDwHA4/J9CiHtnKfd+AonfA2CSd5hU6eFwSA+uVUGfGw6HQFHgYGyueQeJWRPb8T7x1eqo7Il9l7yptFGex3KeXAPL1RocFCETYLFg90ySLkiSYn97hBKU5c/dtIiouCFJXUzSgCTEl5kkuCKmi6mh94ZhSJIaUMSoOYwAHWkXcgEcknZEcjAQyYYlwb7/1giYje2eOI5hGAZJzX9P8y6EWCDTgpyTZzzPG5KdEkUM4QozASsRRNKeR55F0zQxNzf3Wrvdfs3zvNdardZrzWbzYKvVesPzvCPtdrs3Nzc3IDU0yzIsLi4iDMM/EULcL8NMfu0PCEmib1YqFQwGA5DTRKZIjT28k161Wg2e50FeB4XEpEphh3WDdaVfczLj6Uoydu0G27aRpikFen4YReR+Gysrz3YAWDJRGLZtIwzDjUKIK2RFh0xujlBRSSkU4/lms7nU6/XmTdPEYDA4QwhxOYpKG0QqCwA+LO07tHn3sPzUWFF54fv+Yfm/HfTUlsT4AQBPK06ABoo81k3SFgPLsjAYDM6l6xBCNE4yaTuWhLUJwEe4RFKtVs9G4b0OpOMklr8vAIgXFxdty7Jg2zYGg8H5QogrAPzTKlVRLIpDk5LbIwAegFL2W1lbFwH4WhAEl55xxhk4fPgwkiT5dLvdflbO9a97bS8A8Mg2OD8/D9M0/6PUOoIZpG+K7TuTxzSqDYu0xHbyqaExVuZ2mky6ur7T6dS5yB4EAcIwvDgMw21BEJy1tLS07ejRo+f3er3L4ji+lAI4yZ4B4GNM6lJjl3gTjwDAgyyAEwA+wytzALg5iqJxuZxGo/GmlCDJ0RCXVagAsKvX65E6BMdxEMfxtm63e2Gv19t29OjRbb1eb1uv1zuj3+9fGobhWaZpgipCSJvVJ3hGxEmmhoQA/l2SJC1SFWVe5hlHjx49v9vtXtrr9c566623zu12uxcfPXr0rH6/fy49IIgIUWQipIp6TveoCyAl9VOe5xXf9wMe1sNMFBQr9gsAl7uu+9Ivf/lLOI5DXvWPvUPre5HIK8syus7A9/1Ds5CSzAsNiIR5oO56I7V1J7EpT2a6tgUA15imOS71QnYV2jxJkoxtFgDGRmJSReUmuBHAZ8FauIFVRlXsYg9blvUng8EAjUYDw+FwBz115QLdSQHCUl3dx6SLmD1hacFR+evraTOGYQjP8xBF0VjdGI1G43QbMrw7jgOWJgYAHwbw+6p0eBLdv1ujKEKSJLBtG7Ztg8JaKAE+TdNxkGqapnBdF0mScAnsJkgPuHQkdImgKB5M8YqaZdI/X1Osgu497Xb7b6MoItX3Wmp9+A7MT4MS8aUTY/xwOg51soHC++zq6h4nP8im4kkjtANgU6fT+TAZiqvVKlzX/cdWq/VSs9lcajabP5yfn3+j2Wz+rNVq/azVai3Nzc39favVeq3Vao2rdvT7fQNFNgFf9A3FcUGb4HXHcb4hVSPEcQwhxG5pRzoziqIrgyCA67oYDofwfZ+HKdAmW1Ku691RFG03DANU2NFxnNfa7fYPPM97s9ls/nx+fv7nzWbzYL1ef2Nubu7nc3NzP6/X6z2qPsJqcX2K2W1OSDoNL6ejbjLVc8hDcBSJcWuv17uaxRiiXq//oN1u/6zVah30PO+gZVkH5+fnDzYajYPNZvPg3NzcwVqtdrDVauXk8Zbq9+fpGpmXnNR1hyQ2+bOrxrExyc2Sdksa6z6aSwDo9XoGygtIquiW2IOP6ZCl9MrwmG3RAtClAHD54PpV2XxPMdVQvnNXPmiD9eg8WJcxLPKm0dP5ViIDAKjVan+JIu4nBrDImhtTjXpTLtRNhmHsbDQaX2TF+i4XQmz2ff+QXGhLytMyY5vo+Xq9ftNgMKAn+y7f9x8SQuyk5O3RaATXdX/A29cpaVO8GfHdNA7HcVCr1b6KIt3rVWl/odLmFrMZpgA22ba9OQiCH1E9s3q9/iFZGvrQiQr3kMTGO2bRWCiqPysxHYBd5yYA99KDpFqtol6v/28AfyKPc2jKED4P4NMAyFv8W6zqcapIw6FlWaDUORSZIHHJOlK97KkQ4pxqtUrhFrAsCywmcDVQYHcM1ilLcWzQ57pQCoySM4Q0DkmsFFvJpftJeyJVJGNeyEE7D04VB4J8ynoAPkk2Jqn2PcxTlhgxhVgZlxYIIZ6yLOuLpO6laXqZZVlXoMjlpMTqTQAO8a7vcpE9Va1Wd4dheGGlUsFwOLxSJrz/EasDBkmyq+UaekKIMEmSHaZpghLtpfr6KrO/QNm8dH1vAgjr9ToMw0AURYjj+DLHcS6HDBM5EZDE7zCyog27whGi9vWUUi8R343SbkiE8xhrEDNtrX6p0Wh8OgxDJEmCOI4vdhznGgBPse/HnIhJdWemBK6Wqo1aaNyXsO+h1WrlM1bX4K0bg0nkyfpEkIeb+sx65Dwgk4pcg6kQIpgxiV/9DLWejHXZopMbmSK13bK0tATHcTAYDLBhw4YlFKW0ub3LZc6AcXMOGTP1umEY3zEM44N5nqPf72Nubm6nJDaVSKg6Bak+B4QQjwK4jyLFbdu+q9vtbqFqpjJIeB9riByzJzSv1rt9MBjQ5+G67gDSy0rS2hQ7SVCr1b43GAyutiwLsmjjRwA8rnaeOm7jGOsZUFZxghnxVxAM6xy1q9frGWRLc123h6I5joeVHuhJeF0I8e1KpXKdLCkEx3HuJGJT8mw9kuDlA+aYLukl57OkZ/TuIAjA+g48NqPERgSlNsc2V5EWDzNJMQbQJWlNEutau4E55CShB+J6VEPXFbEpkgD9vnt8R4s8zPtVKYdLO6zF3vjJKoR40HGcD1KVWgA7hRBbfd8/oH6fnXdeLsonXNe9LwgCcljcoQz7r9mmICO3aszNAHzKMAwkSULX8RXmsg8mlDjinq9YCPGlLMuutm2bbFA3CiHuQdHs5W3b2STpOkwtBpPGLMi2hkKIhnx4bEIRpkCb97PkrJH2tQelyu/NUj1DXveXR6PRdbT50zTdPoEYUyIHeU8vAvAcju3wbkrysAD8PoCdR44cOZcCdWUs4XdnnKJgwjxbTGJsoKg0AgBqdVtqGTgu8w3gXTLTIp7ReWGy9ord9RrDtt4kNi4JuEKIi4bD4fspXEMuhOcoIZ0bleXfFmgjYWUPz1eq1eoQgC0T4+1Wq7VTlgaa1BOSCOVVIcT3DMO4ulKpoNvtotFooN/v0+b9Clu0qsGdxnBRFEWXAUX0uKwg+zSzZTWEEEtl41D+9l3XdRHHMUzTRK/XM1qt1g7f9+8/EZN/5MgRbNy48X5yTDB7EZF0W0odJvvb1wE8IIS4PIqic2u1GrrdLpHkt9gxZrWtPvPUU0+h1+uNMz88z7tWSm1dNq/dSqVyBjAuMXUriuIDGT3UmITlAjAoHpCyIWShhL8G8NiMqugPpcmC+jjQXDhCiC5zbKTSnrhXCDGOUZPS1aJlWWdlWYbBYADbtj8jx05kNU2bcRjBPieEuFuSfqCJ7eRFqvx+u6zThTzPUavVXgKwXy5sbmMwUeRMHuKqkSQOoKhS+nXDMG6TtjKgqEq7R8nr5CR3mElvX7Jt+2qeZWCaJkzT/KFc7FAMubxKbwMy5o3i6kzT/EcAP2GfjRU1C4oNy5RP5kAI8Rdpmt5J4wBwu3QivO04JsMwEIbhxjRNN5JNkzx4wLiXxLg3g2EYqNfr++SD5OYwDMe9DEzT/BmKhHSPJJFZbUCGYXwVwB3MDnUPihQ57h0dly1K0xRRFF2opiXx9Cp632g0UKvVUKvVYFnWTwF8ianSq+6lo0ePGqZpbqHjkcotxzFOrZMe4bNs235RSlW8UfO7KM0rTVMEQXBWlmVnEdmuwclDD0idK3qKIYSsrMFiuJ5WvUAsKJNqwG/iP1nw4gN84cRxfD6K+DiwTlbjLAfWXcn1ff9Jau8nMxFIWnuGufu7LFsC7OlrAbiBVCYpybxA46XzTio9VNL0+Wu0MWSPyXMBvOtETDileKVpym1AyLJsHF9G5Maqn0Ce/0aqcSbT3b4v530FaU95ufI6H6Qy4qZp4ujRo+czhwClvrk0Jgqd4ERGL0rTopJSpCZblvXfAVzv+/6PqWTQtPmh2DOal7K0J5o/KR22sewxHpdzogcD7ytqWdbUlCpOapJcTSxXqVl3drbKerkQbpuSKTW/h6KWmgPgV77vX/I2j78PRW9IB0V6z6OSnLpUQnzC9zbJzfuoVDcsac95kJUOJ7UnZdKWK8f/EfnTkpLHHgDPcnsiqdYzXMPlUtrcLs+3T6qDz8rr2CrPtxNFx/CfyP8/I1UhixHNOVIN2o6i4co0VYycI4ty03bktSyhyGF9t/zcjwA8hOVMjJmlNVLdUZQv2ikfEC8AeI5UbumZvlnOKZGHK1U0CytbLC7KcXalw+iAlPoDxYapVm+5AkVA91Xy2B16EE5RFckm+aJ8ED+LovN8KoS4RI77Bnldi+x7lGo27fh0jR269zxCQBPbye88oNgeigfL3m75Y27cZaojBWaaqxjwKck+Y5soZVKio1TitUq+Py/fdhVVeU21wBiBmswMkZao4B6TGrtkj6TrYBub5jjEbJVYMyZhOiyGkCL3N/G5UR9Yx3GfKCYx4OQvz9eWfyebU8ycBZwMyGN+Hoq4Rz42XnzAVO7jAiOqWVR9Gjd5j7vqdbN1HSgPQMww/2Qzdols2Rr01ltaVWW9MfVxppcct5SoqEvWJON92biU1n5QF+qk6yApDSsbL//a5405VLKS65vFa1lGsisSz5XjmKs4aCaOcUL9uzXHainBs1nJ9c48vrXOz7S1diKPvx7b7607YpuwOd52nJZ8AqerqFzZhFALbieZGC/FovXLQg7Gny+Bye2GqxEXe2qXSSTWasfH5KoXFoB5LsmsZirgZM4lN379x0Nq7PpQJsEwiZpL1w1mky0936QwmlUIxlVMCg5kj4sZ1lc8Sc1VNBKXSYPhGoh1fL0sGiBbj02T11Mcm1WWezeFjGbGpIXJNpSaMpQquYfdKZsynrB50klS04TCmqvd67hs405R93jaDydhcr6kkF2PpsxfoNiSukR0ctOq55+JSKZdX4mdz2RkzhvkmFhurbhqHucU8oiVclMxVmY2zLS+Sh5uPKQkLiHPbAaJrVtWXRrrsKHLuiE2VZVR3jsnQGKzJgW/rrZwlVg5iz2Rx0/2EhXVwnIwZSnZHMf8BCVkTJsjLbHBjaU5pf3gWApmMV8rGkNPu08sbQjS/mSywN6Y2QDTWSWKSfdXca6oDzhT1qUrvQfqeSdIc8dItOzvFrtX2Qxr7BgTA5v7rjKOtarVdOyYfTfEOsW6KzTJbUDKwjghxPk2/h8rG3osZaj2NrZw41mveY12xWyCbS8tIwgiPNnC7Zj6XZTQPYONKGVSQtncmMr9W1MzX0bMYMQwTu8qIaoYK6vsctWbVx6ZiWCVh1u2Vlvvag9JhTQb7D6ms6y/svW0HlXQdWdjW0WiSk/Q8Z0ye5oqEU4ofYMSO4m1iv1khcQ0xZ4Uz2hjUb19U4m5xFaJsmPM0tCE7FrKPfKw0st63DYfsmGqHuYyG2SJxDp1vcwytkkOhZIKHlNVadW5sspxZ57/SdeuoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoXE64P8DXlMtCqOWS58AAAAASUVORK5CYII=';
