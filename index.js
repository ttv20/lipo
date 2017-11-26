const fs = require('fs-extra');
const deasync = require('deasync');
const _ = require('lodash');
const Frisbee = require('frisbee');
const FormData = require('form-data');
const safeStringify = require('fast-safe-stringify');
const boolean = require('boolean');

// Object.keys(require('sharp').prototype).filter(key => !key.startsWith('_'))
const keys = [
  'metadata',
  'limitInputPixels',
  'sequentialRead',
  'resize',
  'crop',
  'embed',
  'max',
  'min',
  'ignoreAspectRatio',
  'withoutEnlargement',
  'overlayWith',
  'rotate',
  'extract',
  'flip',
  'flop',
  'sharpen',
  'blur',
  'extend',
  'flatten',
  'trim',
  'gamma',
  'negate',
  'normalise',
  'normalize',
  'convolve',
  'threshold',
  'boolean',
  'background',
  'greyscale',
  'grayscale',
  'toColourspace',
  'toColorspace',
  'extractChannel',
  'joinChannel',
  'bandbool',
  'toFile',
  'toBuffer',
  'withMetadata',
  'jpeg',
  'png',
  'webp',
  'tiff',
  'raw',
  'toFormat',
  'tile'
];

class Lipo {
  constructor(config = {}) {
    this.__config = Object.assign(
      {
        key: process.env.LIPO_KEY || '',
        baseURI:
          process.env.NODE_ENV === 'test'
            ? 'http://localhost:3000'
            : 'https://api.lipo.io'
      },
      config
    );

    this.__api = new Frisbee({
      baseURI: this.__config.baseURI,
      headers: {
        Accept: 'application/json'
      }
    });

    if (this.__config.key) this.__api.auth(this.__config.key);

    this.__queue = [];

    return input => {
      this.__input = input;
      return this;
    };

    /*
    // <https://github.com/lovell/sharp/issues/1045>
    return (input, options = {}) => {
      this.__input = null;
      this.__options = {};
      // input = Buffer | String
      // options = Object
      // - density (Number)
      // - raw (Object)
      //   - width (Number)
      //   - height (Number)
      //   - channels (Number; 1-4)
      // - create (Object)
      //   - width (Number)
      //   - height (Number)
      //   - channels (Number; 3-4)
      //   - background (String | Object)
      if (_.isString(input) || _.isBuffer(input)) this.__input = input;
      else if (_.isObject(this.__input)) this.__options = input;
      if (!_.isObject(this.__input) && _.isObject(options))
        this._options = options;
      return this;
    };
    */
  }

  __metadata(fn) {
    const promise = new Promise(async (resolve, reject) => {
      try {
        const body = new FormData();
        if (_.isString(this.__input))
          body.append('input', fs.createReadStream(this.__input));
        else if (_.isBuffer(this.__input)) body.append('input', this.__input);
        else if (_.isObject(this.__input))
          body.append('options', safeStringify(this.__input));
        body.append('queue', safeStringify(this.__queue));
        this.__queue = [];
        const res = await this.__api.post('/', { body });
        if (res.err) throw res.err;
        resolve(res.body);
      } catch (err) {
        reject(err);
      }
    });
    if (_.isFunction(fn))
      promise
        .then(data => {
          fn(null, data);
        })
        .catch(fn);
    else return promise;
  }

  __toFile(fileOut, fn) {
    if (!_.isString(fileOut)) throw new Error('File output path required');
    const promise = new Promise(async (resolve, reject) => {
      try {
        const data = await this.__toBuffer();
        await fs.writeFile(fileOut, data);
        resolve(this.__info);
      } catch (err) {
        reject(err);
      }
    });
    if (_.isFunction(fn))
      promise
        .then(data => {
          fn(null, data);
        })
        .catch(fn);
    else return promise;
  }

  __toBuffer(options = {}, fn) {
    if (_.isFunction(options)) fn = options;
    const promise = new Promise(async (resolve, reject) => {
      try {
        const body = new FormData();
        if (_.isString(this.__input))
          body.append('input', fs.createReadStream(this.__input));
        else if (_.isBuffer(this.__input)) body.append('input', this.__input);
        else if (_.isObject(this.__input))
          body.append('options', safeStringify(this.__input));
        body.append('queue', safeStringify(this.__queue));
        this.__queue = [];
        const res = await this.__api.post('/', { body });
        if (res.err) throw res.err;
        this.__info = {
          format: res.headers.get('x-sharp-format'),
          size: Number(res.headers.get('x-sharp-size')),
          width: Number(res.headers.get('x-sharp-width')),
          height: Number(res.headers.get('x-sharp-height')),
          channels: Number(res.headers.get('x-sharp-channels')),
          premultiplied: boolean(res.headers.get('x-sharp-multiplied'))
        };
        const data = Buffer.concat(res.originalResponse._raw);
        if (_.isObject(options) && boolean(options.resolveWithObject))
          return resolve({ data, info: this.__info });
        resolve(data);
      } catch (err) {
        reject(err);
      }
    });

    if (_.isFunction(fn))
      promise
        .then(data => {
          fn(null, data, this.__info);
        })
        .catch(fn);
    else return promise;
  }

  // <https://github.com/lovell/sharp/issues/360#issuecomment-185162998>
  toFileSync(fileOut) {
    let done = false;
    let data;
    this.toFile(fileOut, (err, _data_) => {
      if (err) {
        throw err;
      }
      data = _data_;
      done = true;
    });
    deasync.loopWhile(() => {
      return !done;
    });
    return data;
  }

  toBufferSync() {
    let done = false;
    let data;
    this.toBuffer((err, _data_) => {
      if (err) {
        throw err;
      }
      data = _data_;
      done = true;
    });
    deasync.loopWhile(() => {
      return !done;
    });
    return data;
  }

  metadataSync() {
    let done = false;
    let data;
    this.metadata((err, _data_) => {
      if (err) {
        throw err;
      }
      data = _data_;
      done = true;
    });
    deasync.loopWhile(() => {
      return !done;
    });
    return data;
  }

  clone() {
    return new Lipo(Object.assign({}, this.__config))(this.__input);
  }
}

keys.forEach(key => {
  Lipo.prototype[key] = function() {
    if (!['toFile', 'toBuffer', 'metadata'].includes(key)) {
      this.__queue.push([key].concat([].slice.call(arguments)));
      return this;
    }
    if (key === 'metadata') {
      this.__queue.push(['metadata']);
      return this.__metadata(...[].slice.call(arguments));
    }
    if (key === 'toFile') return this.__toFile(...[].slice.call(arguments));
    return this.__toBuffer(...[].slice.call(arguments));
  };
});

module.exports = Lipo;
