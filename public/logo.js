//
// Logo Interpreter in Javascript
//

// Copyright (C) 2011 Joshua Bell
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

function LogoInterpreter(turtle, stream, savehook)
{
  'use strict';

  var self = this;

  this.__name = "RND" + Math.random();

  var UNARY_MINUS = '<UNARYMINUS>'; // Must not parse as a word

  var ERRORS = {
    BAD_INPUT: 4,
    NO_OUTPUT: 5,
    NOT_ENOUGH_INPUTS: 6,
    TOO_MANY_INPUTS: 8,
    BAD_OUTPUT: 9,
    MISSING_PAREN: 10,
    BAD_VAR: 11,
    BAD_PAREN: 12,
    ALREADY_DEFINED: 15,
    THROW_ERROR: 21,
    IS_PRIMITIVE: 22,
    BAD_PROC: 24,
    NO_TEST: 25,
    BAD_BRACKET: 26,
    BAD_BRACE: 27,
    USER_GENERATED: 35,
    MISSING_SPACE: 39
  };

  //----------------------------------------------------------------------
  //
  // Utilities
  //
  //----------------------------------------------------------------------

  function format(string, params) {
    return string.replace(/{(\w+)(:[UL])?}/g, function(m, n, o) {
      var s = (n === '_PROC_') ? self.stack[self.stack.length - 1] : String(params[n]);
      switch (o) {
        case ':U': return s.toUpperCase();
        case ':L': return s.toLowerCase();
        default: return s;
      }
    });
  }

  // To support localized/customized messages, assign a lookup function:
  // instance.localize = function(s) {
  //   return {
  //     'Division by zero': 'Divido per nulo',
  //     'Index out of bounds': 'Indekso ekster limojn',
  //     ...
  //   }[s];
  // };
  this.localize = null;
  function __(string) {
    if (self.localize)
      return self.localize(string) || string;
    return string;
  }

  // Shortcut for common use of format() and __()
  function err(string, params, code) {
    // Allow callng as err(string, code)
    if (typeof params === 'number') {
      code = params;
      params = undefined;
    }
    var error = new LogoError('ERROR', undefined, format(__(string), params));
    if (code !== undefined)
      error.code = code;
    return error;
  }

  function LogoError(tag, value, message) {
    this.name = 'LogoError';
    this.message = message || format(__('No CATCH for tag {tag}'), {tag: tag});
    this.tag = tag;
    this.value = value;
    this.proc = self.stack[self.stack.length - 1];
    this.code = -1; // TODO: Support code.
    this.line = -1; // TODO: Support line.
  }

  // To handle additional keyword aliases (localizations, etc), assign
  // a function to keywordAlias. Input will be the uppercased word,
  // output must be one of the keywords (ELSE or END), or undefined.
  // For example:
  // logo.keywordAlias = function(name) {
  //   return {
  //     'ALIE': 'ELSE',
  //     'FINO': 'END'
  //     ...
  //   }[name];
  // };
  this.keywordAlias = null;
  function isKeyword(atom, match) {
    if (Type(atom) !== 'word')
      return false;
    atom = String(atom).toUpperCase();
    if (self.keywordAlias)
      atom = self.keywordAlias(atom) || atom;
    return atom === match;
  }

  // Returns a promise; calls the passed function with (loop, resolve,
  // reject). Calling resolve or reject (or throwing) settles the
  // promise, calling loop repeats.
  function promiseLoop(func) {
    return new Promise(function(resolve, reject) {
      (function loop() {
        try {
          func(loop, resolve, reject);
        } catch (e) {
          reject(e);
        }
      }());
    });
  }

  // Takes a list of (possibly async) closures. Each is called in
  // turn, waiting for its result to resolve before the next is
  // executed. Resolves to an array of results, or rejects if any
  // closure rejects.
  function serialExecute(funcs) {
    var results = [];
    return promiseLoop(function(loop, resolve, reject) {
      if (!funcs.length) {
        resolve(results);
        return;
      }
      Promise.resolve(funcs.shift()())
        .then(function(result) {
          results.push(result);
          loop();
        }, reject);
    });
  }

  // Returns a promise with the same result as the passed promise, but
  // that executes finalBlock before it resolves, regardless of
  // whether it fulfills or rejects.
  function promiseFinally(promise, finalBlock) {
    return promise
      .then(function(result) {
        return Promise.resolve(finalBlock())
          .then(function() {
            return result;
          });
      }, function(err) {
        return Promise.resolve(finalBlock())
          .then(function() {
            throw err;
          });
      });
  }

  // Returns a Promise that will resolve after yielding control to the
  // event loop.
  function promiseYield() {
    return new Promise(function(resolve) {
      setTimeout(resolve, 0);
    });
  }

  // Based on: https://www.jbouchard.net/chris/blog/2008/01/currying-in-javascript-fun-for-whole.html
  // Argument is `$$func$$` to avoid issue if passed function is named `func`.
  function to_arity($$func$$, arity) {
    var parms = [];

    if ($$func$$.length === arity)
      return $$func$$;

    for (var i = 0; i < arity; ++i)
      parms.push('a' + i);

    var f = eval('(function ' + $$func$$.name + '(' + parms.join(',') + ')' +
                 '{ return $$func$$.apply(this, arguments); })');
    return f;
  }


  //----------------------------------------------------------------------
  //
  // Classes
  //
  //----------------------------------------------------------------------

  // Adapted from:
  // https://stackoverflow.com/questions/424292/how-to-create-my-own-javascript-random-number-generator-that-i-can-also-set-the-s
  function PRNG(seed) {
    var S = seed & 0x7fffffff, // seed
        A = 48271, // const
        M = 0x7fffffff, // const
        Q = M / A, // const
        R = M % A; // const

    this.next = function PRNG_next() {
      var hi = S / Q,
          lo = S % Q,
          t = A * lo - R * hi;
      S = (t > 0) ? t : t + M;
      this.last = S / M;
      return this.last;
    };
    this.seed = function PRNG_seed(x) {
      S = x & 0x7fffffff;
    };
    this.next();
  }

  function StringMap(case_fold) {
    this._map = new Map();
    this._case_fold = case_fold;
  }
  Object.defineProperties(StringMap.prototype, {
    get: {value: function(key) {
      key = this._case_fold ? String(key).toLowerCase() : String(key);
      return this._map.get(key);
    }},
    set: {value: function(key, value) {
      key = this._case_fold ? String(key).toLowerCase() : String(key);
      this._map.set(key, value);
    }},
    has: {value: function(key) {
      key = this._case_fold ? String(key).toLowerCase() : String(key);
      return this._map.has(key);
    }},
    delete: {value: function(key) {
      key = this._case_fold ? String(key).toLowerCase() : String(key);
      return this._map.delete(key);
    }},
    keys: {value: function() {
      var keys = [];
      this._map.forEach(function(value, key) { keys.push(key); });
      return keys;
    }},
    empty: {value: function() {
      return this._map.size === 0;
    }},
    forEach: {value: function(fn) {
      return this._map.forEach(function(value, key) {
        fn(key, value);
      });
    }}
  });

  function LogoArray(size, origin) {
    this._array = [];
    this._array.length = size;
    for (var i = 0; i < this._array.length; ++i)
      this._array[i] = [];
    this._origin = origin;
  }
  LogoArray.from = function(list, origin) {
    var array = new LogoArray(0, origin);
    array._array = Array.from(list);
    return array;
  };
  Object.defineProperties(LogoArray.prototype, {
    item: {value: function(i) {
      i = Number(i)|0;
      i -= this._origin;
      if (i < 0 || i >= this._array.length)
        throw err("{_PROC_}: Index out of bounds", ERRORS.BAD_INPUT);
      return this._array[i];
    }},
    setItem: {value: function(i, v) {
      i = Number(i)|0;
      i -= this._origin;
      if (i < 0 || i >= this._array.length)
        throw err("{_PROC_}: Index out of bounds", ERRORS.BAD_INPUT);
      this._array[i] = v;
    }},
    list: {get: function() {
      return this._array;
    }},
    origin: {get: function() {
      return this._origin;
    }},
    length: {get: function() {
      return this._array.length;
    }}
  });

  function Stream(string) {
    this._string = string;
    this._index = 0;
    this._skip();
  }
  Object.defineProperties(Stream.prototype, {
    eof: {get: function() {
      return this._index >= this._string.length;
    }},
    peek: {value: function() {
      var c = this._string.charAt(this._index);
      if (c === '\\')
        c += this._string.charAt(this._index + 1);
      return c;
    }},
    get: {value: function() {
      var c = this._next();
      this._skip();
      return c;
    }},
    _next: {value: function() {
      var c = this._string.charAt(this._index++);
      if (c === '\\')
        c += this._string.charAt(this._index++);
      return c;
    }},
    _skip: {value: function() {
      while (!this.eof) {
        var c = this.peek();
        if (c === '~' && this._string.charAt(this._index + 1) === '\n') {
          this._index += 2;
        } else if (c === ';') {
          do {
            c = this._next();
          } while (!this.eof && this.peek() !== '\n');
          if (c === '~')
            this._next();
        } else {
          return;
        }
      }
    }},
    rest: {get: function() {
      return this._string.substring(this._index);
    }}
  });

  //----------------------------------------------------------------------
  //
  // Interpreter State
  //
  //----------------------------------------------------------------------

  self.turtle = turtle;
  self.stream = stream;
  self.routines = new StringMap(true);
  self.scopes = [new StringMap(true)];
  self.plists = new StringMap(true);
  self.prng = new PRNG(Math.random() * 0x7fffffff);
  self.forceBye = false;
  self.clearProc = function(){
      var keysToRemove = _.filter(self.routines.keys(), function(key){
          var val = self.routines.get(key);
          return (val && !val.primitive);
      });
      _.each(keysToRemove, function(key){
          self.routines.delete(key);
      });
  };

  //----------------------------------------------------------------------
  //
  // Parsing
  //
  //----------------------------------------------------------------------

  // Used to return values from routines (thrown/caught)
  function Output(output) { this.output = output; }
  Output.prototype.toString = function() { return this.output; };
  Output.prototype.valueOf = function() { return this.output; };

  // Used to stop processing cleanly
  function Bye() { }

  function Type(atom) {
    if (atom === undefined) {
      // TODO: Should be caught higher upstream than this
      throw err("No output from procedure", ERRORS.NO_OUTPUT);
    } else if (typeof atom === 'string' || typeof atom === 'number') {
      return 'word';
    } else if (Array.isArray(atom)) {
      return 'list';
    } else if (atom instanceof LogoArray) {
      return 'array';
    } else if ('then' in Object(atom)) {
      throw new Error("Internal error: Unexpected value: a promise");
    } else if (!atom) {
      throw new Error("Internal error: Unexpected value: null");
    } else {
      throw new Error("Internal error: Unexpected value: unknown type");
    }
  }


  //
  // Tokenize into atoms / lists
  //
  // Input: string
  // Output: atom list (e.g. "to", "jump", "repeat", "random", 10, [ "fd", "10", "rt", "10" ], "end"
  //

  function parse(string) {
    if (string === undefined) {
      return undefined; // TODO: Replace this with ...?
    }

    var atoms = [],
        prev, r;

    var stream = new Stream(string);
    while (stream.peek()) {
      var atom;

      // Ignore (but track) leading space - needed for unary minus disambiguation
      var leading_space = isWS(stream.peek());
      while (isWS(stream.peek()))
        stream.get();
      if (!stream.peek())
        break;

      if (stream.peek() === '[') {
        stream.get();
        atom = parseList(stream);
      } else if (stream.peek() === ']') {
        throw err("Unexpected ']'", ERRORS.BAD_BRACKET);
      } else if (stream.peek() === '{') {
        stream.get();
        atom = parseArray(stream);
      } else if (stream.peek() === '}') {
        throw err("Unexpected '}'", ERRORS.BAD_BRACE);
      } else if (stream.peek() === '"') {
        atom = parseQuoted(stream);
      } else if (isOwnWord(stream.peek())) {
        atom = stream.get();
      } else if (inRange(stream.peek(), '0', '9')) {
        atom = parseNumber(stream);
      } else if (inChars(stream.peek(), OPERATOR_CHARS)) {
        atom = parseOperator(stream);
        // From UCB Logo:

        // Minus sign means infix difference in ambiguous contexts
        // (when preceded by a complete expression), unless it is
        // preceded by a space and followed by a nonspace.

        // Minus sign means unary minus if the previous token is an
        // infix operator or open parenthesis, or it is preceded by a
        // space and followed by a nonspace.

        if (atom === '-') {
          var trailing_space = isWS(stream.peek());
          if (prev === undefined ||
              (Type(prev) === 'word' && isInfix(prev)) ||
              (Type(prev) === 'word' && prev === '(') ||
              (leading_space && !trailing_space)) {
            atom = UNARY_MINUS;
          }
        }
      } else if (!inChars(stream.peek(), WORD_DELIMITER)) {
        atom = parseWord(stream);
      } else {
        throw err("Couldn't parse: '{string}'", { string: stream.rest });
      }
      atoms.push(atom);
      prev = atom;
    }
    console.log("atoms", atoms);
    return atoms;
  }

  function inRange(x, a, b) {
    return a <= x && x <= b;
  }

  function inChars(x, chars) {
    return x && chars.indexOf(x) !== -1;
  }

  var WS_CHARS = ' \f\n\r\t\v';
  function isWS(c) {
    return inChars(c, WS_CHARS);
  }

  // "After a quotation mark outside square brackets, a word is
  // delimited by a space, a square bracket, or a parenthesis."
  var QUOTED_DELIMITER = WS_CHARS + '[](){}';
  function parseQuoted(stream) {
    var word = '';
    while (!stream.eof && QUOTED_DELIMITER.indexOf(stream.peek()) === -1) {
      var c = stream.get();
      word += (c.charAt(0) === '\\') ? c.charAt(1) : c.charAt(0);
    }
    return word;
  }

  // Non-standard: U+2190 ... U+2193 are arrows, parsed as own-words.
  var OWNWORD_CHARS = '\u2190\u2191\u2192\u2193';
  function isOwnWord(c) {
    return inChars(c, OWNWORD_CHARS);
  }

  // "A word not after a quotation mark or inside square brackets is
  // delimited by a space, a bracket, a parenthesis, or an infix
  // operator +-*/=<>. Note that words following colons are in this
  // category. Note that quote and colon are not delimiters."
  var WORD_DELIMITER = WS_CHARS + '[](){}+-*/%^=<>';
  function parseWord(stream) {
    var word = '';
    while (!stream.eof && WORD_DELIMITER.indexOf(stream.peek()) === -1) {
      var c = stream.get();
      word += (c.charAt(0) === '\\') ? c.charAt(1) : c.charAt(0);
    }
    return word;
  }

  // "Each infix operator character is a word in itself, except that
  // the two-character sequences <=, >=, and <> (the latter meaning
  // not-equal) with no intervening space are recognized as a single
  // word."
  var OPERATOR_CHARS = '+-*/%^=<>[]{}()';
  function parseOperator(stream) {
    var word = '';
    if (inChars(stream.peek(), OPERATOR_CHARS))
      word += stream.get();
    if ((word === '<' && stream.peek() === '=') ||
        (word === '>' && stream.peek() === '=') ||
        (word === '<' && stream.peek() === '>')) {
      word += stream.get();
    }
    return word;
  }

  function isInfix(word) {
    return ['+', '-', '*', '/', '%', '^', '=', '<', '>', '<=', '>=', '<>']
      .includes(word);
  }

  function isOperator(word) {
    return isInfix(word) || ['[', ']', '{', '}', '(', ')'].includes(word);
  }

  // Non-standard: Numbers support exponential notation (e.g. 1.23e-45)
  function parseNumber(stream) {
    var word = '';
    while (inRange(stream.peek(), '0', '9'))
      word += stream.get();
    if (stream.peek() === '.')
      word += stream.get();
    if (inRange(stream.peek(), '0', '9')) {
      while (inRange(stream.peek(), '0', '9'))
        word += stream.get();
    }
    if (stream.peek() === 'E' || stream.peek() === 'e') {
      word += stream.get();
      if (stream.peek() === '-' || stream.peek() === '+')
        word += stream.get();
      while (inRange(stream.peek(), '0', '9'))
        word += stream.get();
    }
    return word;
  }

  // Includes leading - sign, unlike parseNumber().
  function isNumber(s) {
    return String(s).match(/^-?([0-9]*\.?[0-9]+(?:[eE][\-+]?[0-9]+)?)$/);
  }

  function parseInteger(stream) {
    var word = '';
    if (stream.peek() === '-')
      word += stream.get();
    while (inRange(stream.peek(), '0', '9'))
      word += stream.get();
    return word;
  }

  function parseList(stream) {
    var list = [],
        atom = '',
        c, r;

    while (true) {
      do {
        c = stream.get();
      } while (isWS(c));

      while (c && !isWS(c) && '[]{}'.indexOf(c) === -1) {
        atom += c;
        c = stream.get();
      }

      if (atom.length) {
        list.push(atom);
        atom = '';
      }

      if (!c)
        throw err("Expected ']'", ERRORS.BAD_BRACKET);
      if (isWS(c))
        continue;
      if (c === ']')
        return list;
      if (c === '[') {
        list.push(parseList(stream));
        continue;
      }
      if (c === '{') {
        list.push(parseArray(stream));
        continue;
      }
      if (c === '}')
        throw err("Unexpected '}'", ERRORS.BAD_BRACE);
      throw err("Unexpected '{c}'", {c: c});
    }
  }

  function parseArray(stream) {
    var list = [],
        origin = 1,
        atom = '',
        c, r;

    while (true) {
      do {
        c = stream.get();
      } while (isWS(c));

      while (c && !isWS(c) && '[]{}'.indexOf(c) === -1) {
        atom += c;
        c = stream.get();
      }

      if (atom.length) {
        list.push(atom);
        atom = '';
      }

      if (!c)
        throw err("Expected '}'", ERRORS.BAD_BRACE);
      if (isWS(c))
        continue;
      if (c === '}') {
        while (isWS(stream.peek()))
          stream.get();
        if (stream.peek() === '@') {
          stream.get();
          while (isWS(stream.peek()))
            stream.get();
          origin = Number(parseInteger(stream) || 0);
        }
        return LogoArray.from(list, origin);
      }
      if (c === '[') {
        list.push(parseList(stream));
        continue;
      }
      if (c === ']')
        throw err("Unexpected ']'", ERRORS.BAD_BRACKET);
      if (c === '{') {
        list.push(parseArray(stream));
        continue;
      }
      throw err("Unexpected '{c}'", {c: c});
    }
  }

  function reparse(list) {
    return parse(stringify_nodecorate(list).replace(/([\\;])/g, '\\$1'));
  }

  function maybegetvar(name) {
    var lval = lvalue(name);
    return lval ? lval.value : undefined;
  }

  function getvar(name) {
    var value = maybegetvar(name);
    if (value !== undefined)
      return value;
    throw err("Don't know about variable {name:U}", {name: name}, ERRORS.BAD_VAR);
  }

  function lvalue(name) {
    for (var i = self.scopes.length - 1; i >= 0; --i) {
      if (self.scopes[i].has(name)) {
        return self.scopes[i].get(name);
      }
    }
    return undefined;
  }

  function setvar(name, value) {
    value = copy(value);

    // Find the variable in existing scope
    var lval = lvalue(name);
    if (lval) {
      lval.value = value;
    } else {
      // Otherwise, define a global
      lval = {value: value};
      self.scopes[0].set(name, lval);
    }
  }

  //----------------------------------------------------------------------
  //
  // Expression Evaluation
  //
  //----------------------------------------------------------------------

  // Expression               := RelationalExpression
  // RelationalExpression     := AdditiveExpression [ ( '=' | '<' | '>' | '<=' | '>=' | '<>' ) AdditiveExpression ... ]
  // AdditiveExpression       := MultiplicativeExpression [ ( '+' | '-' ) MultiplicativeExpression ... ]
  // MultiplicativeExpression := PowerExpression [ ( '*' | '/' | '%' ) PowerExpression ... ]
  // PowerExpression          := UnaryExpression [ '^' UnaryExpression ]
  // UnaryExpression          := ( '-' ) UnaryExpression
  //                           | FinalExpression
  // FinalExpression          := string-literal
  //                           | number-literal
  //                           | list
  //                           | variable-reference
  //                           | procedure-call
  //                           | '(' Expression ')'

  // Peek at the list to see if there are additional atoms from a set
  // of options.
  function peek(list, options) {
    if (list.length < 1) { return false; }
    var next = list[0];
    return options.some(function(x) { return next === x; });

  }

  function evaluateExpression(list) {
    return (expression(list))();
  }

  function expression(list) {
    return relationalExpression(list);
  }

  function relationalExpression(list) {
    var lhs = additiveExpression(list);
    var op;
    while (peek(list, ['=', '<', '>', '<=', '>=', '<>'])) {
      op = list.shift();

      lhs = function(lhs) {
        var rhs = additiveExpression(list);

        switch (op) {
          case "<": return defer(function(lhs, rhs) { return (aexpr(lhs) < aexpr(rhs)) ? 1 : 0; }, lhs, rhs);
          case ">": return defer(function(lhs, rhs) { return (aexpr(lhs) > aexpr(rhs)) ? 1 : 0; }, lhs, rhs);
          case "=": return defer(function(lhs, rhs) { return equal(lhs, rhs) ? 1 : 0; }, lhs, rhs);

          case "<=": return defer(function(lhs, rhs) { return (aexpr(lhs) <= aexpr(rhs)) ? 1 : 0; }, lhs, rhs);
          case ">=": return defer(function(lhs, rhs) { return (aexpr(lhs) >= aexpr(rhs)) ? 1 : 0; }, lhs, rhs);
          case "<>": return defer(function(lhs, rhs) { return !equal(lhs, rhs) ? 1 : 0; }, lhs, rhs);
          default: throw new Error("Internal error in expression parser");
        }
      } (lhs);
    }

    return lhs;
  }


  // Takes a function and list of (possibly async) closures. Returns a
  // closure that, when executed, evaluates the closures serially then
  // applies the function to the results.
  function defer(func /*, input...*/) {
    var input = [].slice.call(arguments, 1);
    return function() {
      return serialExecute(input.slice())
        .then(function(args) {
          return func.apply(null, args);
        });
    };
  }

  function additiveExpression(list) {
    var lhs = multiplicativeExpression(list);
    var op;
    while (peek(list, ['+', '-'])) {
      op = list.shift();

      lhs = function(lhs) {
        var rhs = multiplicativeExpression(list);
        switch (op) {
          case "+": return defer(function(lhs, rhs) { return aexpr(lhs) + aexpr(rhs); }, lhs, rhs);
          case "-": return defer(function(lhs, rhs) { return aexpr(lhs) - aexpr(rhs); }, lhs, rhs);
          default: throw new Error("Internal error in expression parser");
        }
      } (lhs);
    }

    return lhs;
  }

  function multiplicativeExpression(list) {
    var lhs = powerExpression(list);
    var op;
    while (peek(list, ['*', '/', '%'])) {
      op = list.shift();

      lhs = function(lhs) {
        var rhs = powerExpression(list);
        switch (op) {
          case "*": return defer(function(lhs, rhs) { return aexpr(lhs) * aexpr(rhs); }, lhs, rhs);
          case "/": return defer(function(lhs, rhs) {
            var n = aexpr(lhs), d = aexpr(rhs);
            if (d === 0) { throw err("Division by zero", ERRORS.BAD_INPUT); }
            return n / d;
          }, lhs, rhs);
          case "%": return defer(function(lhs, rhs) {
            var n = aexpr(lhs), d = aexpr(rhs);
            if (d === 0) { throw err("Division by zero", ERRORS.BAD_INPUT); }
            return n % d;
          }, lhs, rhs);
          default: throw new Error("Internal error in expression parser");
        }
      } (lhs);
    }

    return lhs;
  }

  function powerExpression(list) {
    var lhs = unaryExpression(list);
    var op;
    while (peek(list, ['^'])) {
      op = list.shift();
      lhs = function(lhs) {
        var rhs = unaryExpression(list);
        return defer(function(lhs, rhs) { return Math.pow(aexpr(lhs), aexpr(rhs)); }, lhs, rhs);
      } (lhs);
    }

    return lhs;
  }

  function unaryExpression(list) {
    var rhs, op;

    if (peek(list, [UNARY_MINUS])) {
      op = list.shift();
      rhs = unaryExpression(list);
      return defer(function(rhs) { return -aexpr(rhs); }, rhs);
    } else {
      return finalExpression(list);
    }
  }

  function finalExpression(list) {
    if (!list.length) {
        console.log(list, self);
        if(self.lastFunctionCall){
            throw err("Unexpected end of instructions, " + self.lastFunctionCall + " ?", ERRORS.MISSING_PAREN, list);
        }
        else{
            throw err("Unexpected end of instructions", ERRORS.MISSING_PAREN, list);
        }
    }

    var atom = list.shift();

    var result, literal, varname;

    switch (Type(atom)) {
    case 'array':
    case 'list':
      return function() { return atom; };

    case 'word':
      if (isNumber(atom)) {
        // number literal
        atom = parseFloat(atom);
        return function() { return atom; };
      }

      atom = String(atom);
      if (atom.charAt(0) === '"' || atom.charAt(0) === "'") {
        // string literal
        literal = atom.substring(1);
        return function() { return literal; };
      }
      if (atom.charAt(0) === ':') {
        // variable
        varname = atom.substring(1);
        return function() { return getvar(varname); };
      }
      if (atom === '(') {
        // parenthesized expression/procedure call
        if (list.length && Type(list[0]) === 'word' && self.routines.has(String(list[0])) &&
            !(list.length > 1 && Type(list[1]) === 'word' && isInfix(String(list[1])))) {
          // Lisp-style (procedure input ...) calling syntax
          atom = list.shift();
          return self.dispatch(atom, list, false);
        }
        // Standard parenthesized expression
        result = expression(list);

        if (!list.length)
          throw err("Expected ')'", ERRORS.MISSING_PAREN);
        if (!peek(list, [')']))
          throw err("Expected ')', saw {word}", { word: list.shift() }, ERRORS.MISSING_PAREN);
        list.shift();
        return result;
      }
      if (atom === ')')
        throw err("Unexpected ')'", ERRORS.BAD_PAREN);
      // Procedure dispatch
      return self.dispatch(atom, list, true);

    default: throw new Error("Internal error in expression parser");
    }
  }

  self.stack = [];

  self.dispatch = function(name, tokenlist, natural) {
    name = name.toUpperCase();
    self.lastFunctionCall = name.toLowerCase();
    var procedure = self.routines.get(name);
    if (!procedure) {

      // Give a helpful message in a common error case.
      var m;
      if ((m = /^(\w+?)(\d+)$/.exec(name)) && self.routines.get(m[1])) {
        throw err("Need a space between {name:U} and {value}",
                  { name: m[1], value: m[2] }, ERRORS.MISSING_SPACE);
      }

      throw err("I don't know how to {name:U}", { name: name.toLowerCase() }, ERRORS.BAD_PROC);
    }

    if (procedure.special) {
      // Special routines are built-ins that get handed the token list:
      // * workspace modifiers like TO that special-case varnames
      self.stack.push(name);
      try {
        procedure.call(self, tokenlist);
        return function() { };
      } finally {
        self.stack.pop();
      }
    }

    var args = [];
    if (natural) {
      // Natural arity of the function
      for (var i = 0; i < procedure.default; ++i) {
        args.push(expression(tokenlist));
      }
    } else {
      // Caller specified argument count
      while (tokenlist.length && !peek(tokenlist, [')'])) {
        args.push(expression(tokenlist));
      }
      tokenlist.shift(); // Consume ')'

      if (args.length < procedure.minimum)
        throw err("Not enough inputs for {name:U}", {name: name}, ERRORS.NOT_ENOUGH_INPUTS);
      if (procedure.maximum !== -1 && args.length > procedure.maximum)
        throw err("Too many inputs for {name:U}", {name: name}, ERRORS.TOO_MANY_INPUTS);
    }

    if (procedure.noeval) {
      return function() {
        self.stack.push(name);
        return promiseFinally(procedure.apply(self, args),
                              function() { self.stack.pop(); });
      };
    }

    return function() {
      self.stack.push(name);
      return promiseFinally(serialExecute(args.slice()).then(function(args) {
        return procedure.apply(self, args);
      }), function() { self.stack.pop(); });
    };
  };

  //----------------------------------------------------------------------
  // Arithmetic expression convenience function
  //----------------------------------------------------------------------
  function aexpr(atom) {
      var msg = "I expected a number, did you miss something out?";
    if (atom === undefined) {
        throw err(msg, ERRORS.BAD_INPUT);
    }
    switch (Type(atom)) {
    case 'word':
      if (isNumber(atom))
        return parseFloat(atom);
      break;
    }
    throw err(msg, ERRORS.BAD_INPUT);
  }

  //----------------------------------------------------------------------
  // String expression convenience function
  //----------------------------------------------------------------------
  function sexpr(atom) {
    if (atom === undefined) throw err("Expected string", ERRORS.BAD_INPUT);
    if (atom === UNARY_MINUS) return '-';
    if (Type(atom) === 'word') return String(atom);

    throw new err("Expected string", ERRORS.BAD_INPUT);
  }

  //----------------------------------------------------------------------
  // List expression convenience function
  //----------------------------------------------------------------------

  // 'list expression'
  // Takes an atom - if it is a list is is returned unchanged. If it
  // is a word a list of the characters is returned. If the procedure
  // returns a list, the output type should match the input type, so
  // use sifw().
  function lexpr(atom) {
    if (atom === undefined)
      throw err("{_PROC_}: Expected list", ERRORS.BAD_INPUT);
    switch (Type(atom)) {
    case 'word':
      return Array.from(String(atom));
    case 'list':
      return copy(atom);
    }

    throw err("{_PROC_}: Expected list", ERRORS.BAD_INPUT);
  }

  // 'stringify if word'
  // Takes an atom which is to be the subject of lexpr() and a result
  // list. If the atom is a word, returns a word, otherwise a list.
  function sifw(atom, list) {
    return (Type(atom) === 'word') ? list.join('') : list;
  }

  //----------------------------------------------------------------------
  // Returns a deep copy of a value (word or list). Arrays are copied
  // by reference.
  //----------------------------------------------------------------------
  function copy(value) {
    switch (Type(value)) {
    case 'list': return value.map(copy);
    default: return value;
    }
  }

  //----------------------------------------------------------------------
  // Deep compare of values (numbers, strings, lists)
  //----------------------------------------------------------------------
  function equal(a, b) {
    if (Type(a) !== Type(b)) return false;
    switch (Type(a)) {
    case 'word':
      if (typeof a === 'number' || typeof b === 'number')
        return Number(a) === Number(b);
      else
        return String(a) === String(b);
    case 'list':
      if (a.length !== b.length)
        return false;
      for (var i = 0; i < a.length; ++i) {
        if (!equal(a[i], b[i]))
          return false;
      }
      return true;
    case 'array':
      return a === b;
    }
    return undefined;
  }

  //----------------------------------------------------------------------
  //
  // Execute a script
  //
  //----------------------------------------------------------------------

  //----------------------------------------------------------------------
  // Execute a sequence of statements
  //----------------------------------------------------------------------
  self.execute = function(statements, options) {
    options = Object(options);
	// Operate on a copy so the original is not destroyed
    statements = statements.slice();

    var lastResult;
    return promiseLoop(function(loop, resolve, reject) {
		//console.log("(statements " + statements)
      if (self.forceBye) {
        self.forceBye = false;
        reject(new Bye);
        return;
      }
      if (!statements.length) {
        resolve(lastResult);
        return;
      }
      Promise.resolve(evaluateExpression(statements))
        .then(function(result) {
          if (result !== undefined && !options.returnResult) {
            reject(err("I don't know what to do with {result}", {result: result},
                  ERRORS.BAD_OUTPUT));
            return;
          }
          lastResult = result;
          loop();
        }, reject);
    });
  };

  // FIXME: should this confirm that something is running?
  self.bye = function() {
    self.forceBye = true;
  };

  var lastRun = Promise.resolve();

  // Call to insert an arbitrary task (callback) to be run in sequence
  // with pending calls to run. Useful in tests to do work just before
  // a subsequent assertion.
  self.queueTask = function(task) {
    var promise = lastRun.then(function() {
      return Promise.resolve(task());
    });
    lastRun = promise.catch(function(){});
    return promise;
  };

  self.run = function(string, options) {
	  options = Object(options);
      self.lastFunctionCall = null;
    return self.queueTask(function() {
      // Parse it
	  var atoms = parse(string);
	  // And execute it!
      return self.execute(atoms, options)
        .catch(function(err) {
          if (!(err instanceof Bye))
            throw err;
        });
    });
  };

  self.definition = function(name, proc) {

    function defn(atom) {
      switch (Type(atom)) {
      case 'word': return String(atom);
      case 'list': return '[ ' + atom.map(defn).join(' ') + ' ]';
      case 'array': return '{ ' + atom.list.map(defn).join(' ') + ' }' +
          (atom.origin === 1 ? '' : '@' + atom.origin);
      default: throw new Error("Internal error: unknown type");
      }
    }

    var def = "to " + name;

    def += proc.inputs.map(function(i) {
      return ' :' + i;
    }).join('');
    def += proc.optional_inputs.map(function(op) {
      return ' [:' + op[0] + ' ' + op[1].map(defn).join(' ') + ']';;
    }).join('');
    if (proc.rest)
      def += ' [:' + proc.rest + ']';
    if (proc.def !== undefined)
      def += ' ' + proc.def;

    def += "\n";
    def += "  " + proc.block.map(defn).join(" ").replace(new RegExp(UNARY_MINUS + ' ', 'g'), '-');
    def += "\n" + "end";

    return def;
  };

  // API to allow pages to persist definitions
  self.procdefs = function() {
    var defs = [];
    self.routines.forEach(function(name, proc) {
      if (!proc.primitive) {
        defs.push(self.definition(name, proc));
      }
    });
    return defs.join("\n\n");
  };

  // API to allow aliasing. Can be used for localization. Does not
  // check for errors.
  self.copydef = function(newname, oldname) {
    self.routines.set(newname, self.routines.get(oldname));
  };

  //----------------------------------------------------------------------
  //
  // Built-In Proceedures
  //
  //----------------------------------------------------------------------

  // Basic form:
  //
  //  def("procname", function(input1, input2, ...) { ... return output; });
  //   * inputs are JavaScript strings, numbers, or Arrays
  //   * output is string, number, Array or undefined/no output
  //
  // Special forms:
  //
  //  def("procname", function(tokenlist) { ... }, {special: true});
  //   * input is Array (list) of tokens (words, numbers, Arrays)
  //   * used for implementation of special forms (e.g. TO inputs... statements... END)
  //
  //  def("procname", function(fin, fin, ...) { ... return op; }, {noeval: true});
  //   * inputs are arity-0 functions that evaluate to string, number Array
  //   * used for short-circuiting evaluation (AND, OR)
  //   * used for repeat evaluation (DO.WHILE, WHILE, DO.UNTIL, UNTIL)
  //

  function stringify(thing) {
    switch (Type(thing)) {
    case 'list':
      return "[" + thing.map(stringify).join(" ") + "]";
    case 'array':
      return "{" + thing.list.map(stringify).join(" ") + "}" +
        (thing.origin === 1 ? '' : '@' + thing.origin);
    default:
      return sexpr(thing);
    }
  }

  function stringify_nodecorate(thing) {
    switch (Type(thing)) {
    case 'list':
      return thing.map(stringify).join(" ");
    case 'array':
      return thing.list.map(stringify).join(" ");
    default:
      return sexpr(thing);
    }
  }

  function def(name, fn, props) {
    fn.minimum = fn.default = fn.maximum = fn.length;
    if (props) {
      Object.keys(props).forEach(function(key) {
        fn[key] = props[key];
      });
    }
    fn.primitive = true;
    if (Array.isArray(name)) {
      name.forEach(function(name) {
        self.routines.set(name, fn);
      });
    } else {
      self.routines.set(name, fn);
    }
  }

  //
  // Procedures and Flow Control
  //
  def("to", function(list) {
    var name = sexpr(list.shift());
    if (isNumber(name) || isOperator(name))
      throw err("TO: Expected identifier", ERRORS.BAD_INPUT);

    var inputs = []; // [var, ...]
    var optional_inputs = []; // [[var, [expr...]], ...]
    var rest = undefined; // undefined or var
    var length = undefined; // undefined or number
    var block = [];

    // Process inputs, then the statements of the block
    var REQUIRED = 0, OPTIONAL = 1, REST = 2, DEFAULT = 3, BLOCK = 4;
    var state = REQUIRED, sawEnd = false;
    while (list.length) {
      var atom = list.shift();
      if (isKeyword(atom, 'END')) {
        sawEnd = true;
        break;
      }

      if (state === REQUIRED) {
        if (Type(atom) === 'word' && String(atom).charAt(0) === ':') {
          inputs.push(atom.substring(1));
          continue;
        }
        state = OPTIONAL;
      }

      if (state === OPTIONAL) {
        if (Type(atom) === 'list' && atom.length > 1 &&
            String(atom[0]).charAt(0) === ':') {
          optional_inputs.push([atom.shift().substring(1), atom]);
          continue;
        }
        state = REST;
      }

      if (state === REST) {
        state = DEFAULT;
        if (Type(atom) === 'list' && atom.length === 1 &&
            String(atom[0]).charAt(0) === ':') {
          rest = atom[0].substring(1);
          continue;
        }
      }

      if (state === DEFAULT) {
        state = BLOCK;
        if (Type(atom) === 'word' && isNumber(atom)) {
          length = parseFloat(atom);
          continue;
        }
      }

      block.push(atom);
    }
    if (!sawEnd)
      throw err("TO: Expected END", ERRORS.BAD_INPUT);

    defineProc(name, inputs, optional_inputs, rest, length, block);
  }, {special: true});

  function defineProc(name, inputs, optional_inputs, rest, def, block) {
    if (self.routines.has(name) && self.routines.get(name).primitive)
      throw err("{_PROC_}: Can't redefine primitive {name:U}", { name: name },
                ERRORS.IS_PRIMITIVE);

    if (def !== undefined &&
        (def < inputs.length || (!rest && def > inputs.length + optional_inputs.length))) {
      throw err("{_PROC_}: Bad default number of inputs for {name:U}", {name: name},
               ERRORS.BAD_INPUT);
    }

    var length = (def === undefined) ? inputs.length : def;

    // Closure over inputs and block to handle scopes, arguments and outputs
    var func = function() {
      // Define a new scope
      var scope = new StringMap(true);
      self.scopes.push(scope);

      var i = 0, op;
      for (; i < inputs.length && i < arguments.length; ++i)
        scope.set(inputs[i], {value: arguments[i]});
      for (; i < inputs.length + optional_inputs.length && i < arguments.length; ++i) {
        op = optional_inputs[i - inputs.length];
        scope.set(op[0], {value: arguments[i]});
      }
      for (; i < inputs.length + optional_inputs.length; ++i) {
        op = optional_inputs[i - inputs.length];
        scope.set(op[0], {value: evaluateExpression(reparse(op[1]))});
      }
      if (rest)
        scope.set(rest, {value: [].slice.call(arguments, i)});

      return promiseFinally(self.execute(block).then(promiseYield, function(err) {
        if (err instanceof Output)
          return err.output;
        throw err;
      }), function() {
        self.scopes.pop();
      });
    };

    var proc = to_arity(func, length);
    self.routines.set(name, proc);

    // For DEF de-serialization
    proc.inputs = inputs;
    proc.optional_inputs = optional_inputs;
    proc.rest = rest;
    proc.def = def;
    proc.block = block;

    proc.minimum = inputs.length;
    proc.default = length;
    proc.maximum = rest ? -1 : inputs.length + optional_inputs.length;

    if (savehook)
      savehook(name, self.definition(name, proc));
  }


  def("def", function(list) {

    var name = sexpr(list);
    var proc = this.routines.get(name);
    if (!proc)
      throw err("{_PROC_}: I don't know how to {name:U}", { name: name }, ERRORS.BAD_PROC);
    if (!proc.inputs) {
      throw err("{_PROC_}: Can't show definition of primitive {name:U}", { name: name },
               ERRORS.IS_PRIMITIVE);
    }

    return this.definition(name, proc);
  });


  //----------------------------------------------------------------------
  //
  // 2. Data Structure Primitives
  //
  //----------------------------------------------------------------------


  function item(index, thing) {
    switch (Type(thing)) {
    case 'list':
      if (index < 1 || index > thing.length)
        throw err("{_PROC_}: Index out of bounds", ERRORS.BAD_INPUT);
      return thing[index - 1];
    case 'array':
      return thing.item(index);
    default:
      thing = sexpr(thing);
      if (index < 1 || index > thing.length)
        throw err("{_PROC_}: Index out of bounds", ERRORS.BAD_INPUT);
      return thing.charAt(index - 1);
    }
  }





  //
  // 2.3 Data Mutators
  //

  function contains(atom, value) {
    if (atom === value) return true;
    switch (Type(atom)) {
    case 'list':
      return atom.some(function(a) { return contains(a, value); });
    case 'array':
      return atom.list.some(function(a) { return contains(a, value); });
    default:
      return false;
    }
  }




  //
  // 2.4 Predicates
  //


  def("random", function(max) {
    if (arguments.length < 2) {
      max = aexpr(max);
      return Math.floor(this.prng.next() * max);
    } else {
      var start = aexpr(arguments[0]);
      var end = aexpr(arguments[1]);
      return Math.floor(this.prng.next() * (end - start + 1)) + start;
    }
  }, {maximum: 2});


  //----------------------------------------------------------------------
  //
  // 6. Graphics
  //
  //----------------------------------------------------------------------
  // 6.1 Turtle Motion

  def(["forward", "fd"], function(a) { return turtle.move(aexpr(a)); });
  def(["back", "bk"], function(a) { return turtle.move(-aexpr(a)); });
  def(["left", "lt"], function(a) { return turtle.turn(-aexpr(a)); });
  def(["right", "rt"], function(a) { return turtle.turn(aexpr(a)); });


  def("setxy", function(x, y) { turtle.position = [aexpr(x), aexpr(y)]; });
  def(["setheading"], function(a) { turtle.heading = aexpr(a); });

  def("home", function() { return turtle.home(); });

  def(["pendown", "pd"], function() { return turtle.initPenDown();});
  def(["penup", "pu"], function() { return turtle.initPenUp();});

  this.colorAlias = null;

  var PALETTE = {
    0: "black", 1: "blue", 2: "lime", 3: "cyan",
    4: "red", 5: "magenta", 6: "yellow", 7: "white",
    8: "brown", 9: "tan", 10: "green", 11: "aquamarine",
    12: "salmon", 13: "purple", 14: "orange", 15: "gray"
  };

  function parseColor(color) {
      console.log(color);
      if(_.isString(color) && color.toLowerCase() === "red"){
          return '#ff0000';
      }
      // etc TODO

    function adjust(n) {
      // Clamp into 0...99

      n = Math.min(99, Math.max(0, Math.floor(n)));
      // Scale to 0...255
      return Math.floor(n * 255 / 99);
    }
    if (Type(color) === 'list') {
      var r = adjust(aexpr(color[0]));
      var g = adjust(aexpr(color[1]));
      var b = adjust(aexpr(color[2]));
      var rr = (r < 16 ? "0" : "") + r.toString(16);
      var gg = (g < 16 ? "0" : "") + g.toString(16);
      var bb = (b < 16 ? "0" : "") + b.toString(16);
      return '#' + rr + gg + bb;
    }
    color = sexpr(color);
    if (PALETTE.hasOwnProperty(color)){
		//console.log(PALETTE[color])
      return PALETTE[color];
	}
    if (self.colorAlias){
		//console.log(self.colorAlias)
      return self.colorAlias(color) || color;
	}
	//console.log("---- " + color.charAt(color.length-1))
	//has a trailing " hmm
	if (color.charAt(color.length-1) == '"'){
		color = color.slice(0,color.length-1)
	}
    return color;
  }

  def(["setpencolor", "setpc", "setcolor"], function(color) {
	console.log(color);
	var pColor = parseColor(color);
	console.log(pColor);
    if(pColor === "green"){
        pColor = "#00d46e"; // jg - I want it to match another shade of green used in the UI...
    }
	return turtle.initPenColor(pColor);
	//return turtle.initPenColor(color);
  });
  
  def(["setpensize", "setwidth", "setpw", "setps"], function(a) {
	 var penwidth = 1;
    if (Type(a) === 'list'){
		penwidth = aexpr(a[0]);
	}else{
		penwidth = aexpr(a);
	}
    return turtle.initPenWidth(penwidth);
  });

  //----------------------------------------------------------------------
  //
  // 7. Workspace Management
  //
  //----------------------------------------------------------------------
  // 7.1 Procedure Definition

  def("define", function(name, list) {
    name = sexpr(name);
    list = lexpr(list);
    if (list.length != 2)
      throw err("{_PROC_}: Expected list of length 2", ERRORS.BAD_INPUT);

    var inputs = [];
    var optional_inputs = [];
    var rest = undefined;
    var def = undefined;
    var block = reparse(lexpr(list[1]));

    var ins = lexpr(list[0]);
    var REQUIRED = 0, OPTIONAL = 1, REST = 2, DEFAULT = 3, ERROR = 4;
    var state = REQUIRED;
    while (ins.length) {
      var atom = ins.shift();
      if (state === REQUIRED) {
        if (Type(atom) === 'word') {
          inputs.push(atom);
          continue;
        }
        state = OPTIONAL;
      }

      if (state === OPTIONAL) {
        if (Type(atom) === 'list' && atom.length > 1 && Type(atom[0]) === 'word') {
          optional_inputs.push([atom.shift(), atom]);
          continue;
        }
        state = REST;
      }

      if (state === REST) {
        state = DEFAULT;
        if (Type(atom) === 'list' && atom.length === 1 && Type(atom[0]) === 'word') {
          rest = atom[0];
          continue;
        }
      }

      if (state === DEFAULT) {
        state = ERROR;
        if (Type(atom) === 'word' && isNumber(atom)) {
          def = parseFloat(atom);
          continue;
        }
      }

      throw err("{_PROC_}: Unexpected inputs", ERRORS.BAD_INPUT);
    }

    defineProc(name, inputs, optional_inputs, rest, def, block);
  });


  // 7.2 Variable Definition

  def("make", function(varname, value) {
    setvar(sexpr(varname), value);
  });

  def(["repeat","rpt"], function(count, statements) {
    count = aexpr(count);
    statements = reparse(lexpr(statements));
    var old_repcount = this.repcount;
    var i = 1;
    return promiseFinally(
      promiseLoop(function(loop, resolve, reject) {
        if (i > count) {
          resolve();
          return;
        }
        this.repcount = i++;
        this.execute(statements)
          .then(promiseYield)
          .then(loop, reject);
      }.bind(this)), function() {
        this.repcount = old_repcount;
      }.bind(this));
  });


    // added by js
    def("cls", function() {
        return turtle.doCls();
    });

}

