'use strict'; + '.elm'

var _ = require('lodash');
var loaderUtils = require('loader-utils');
var mkdirp = require('mkdirp');
var fs = require("fs");
var path = require("path");
var elmxParser = require('elmx');

var cachedDependencies = [];

var defaultOptions = {
  exts: ['.elm', '.elmx', '.js', '.jsx'],
  srcDirs: null,
  cache: false
};

var getInput = function() {
  return this.resourcePath;
};

var getOptions = function() {
  var globalOptions = this.options.elmx || {};
  var loaderOptions = loaderUtils.getLoaderConfig(this, 'elmx');
  return _.extend({
    emitWarning: this.emitWarning
  }, defaultOptions, globalOptions, loaderOptions);
};

var addDependencies = function(dependencies) {
  cachedDependencies = dependencies;
  _(dependencies).map(this.addDependency.bind(this))
  return dependencies;
};

function checkIsFile(path) {
  return new Promise(function(resolve, reject) {
    fs.stat(path, function(err, stats) {
      if (err) {
        reject(err);
      } else if (stats.isFile()) {
        resolve(path);
      } else {
        reject(path);
      }
    });
  });
}

function findDependencyInSrcDirs(logicalName, srcDirs, exts) {
  var promises = _.map(srcDirs, function (dir) {
    return _.map(exts, function (ext) {
      var relative = logicalName + ext;
      return checkIsFile(path.join(dir, logicalName + ext)).then(function (file) {
        return {file: file, logical: logicalName}
      }, function () { return null })
    })
  })
  return Promise.all(_.flatten(promises)).then(function (paths) {
    return _.compact(paths)[0]
  })
}



// Returns a Promise that returns a flat list of all the Elm files the given
// Elm file depends on, based on the modules it loads via `import`.
function findAllDependencies(file, knownDependencies, srcDirs, exts) {
  if (!knownDependencies) {
    knownDependencies = [];
  }

  if (!srcDirs) {
    srcDirs = [path.dirname(file)];
  }

  return new Promise(function(resolve, reject) {

    fs.readFile(file, {encoding: "utf8"}, function(err, lines) {
      if (err) {
        reject(err);
      } else {
        // Turn e.g. ~/code/elm-css/src/Css.elm
        // into just ~/code/elm-css/src/
        var promises = lines.split("\n").map(function(line) {
          var matches = line.match(/^import\s+([^\s]+)/);

          if (matches) {
            // e.g. Css.Declarations
            var moduleName = matches[1];

            // e.g. Css/Declarations
            var dependencyLogicalName = moduleName.replace(/\./g, "/");

            return findDependencyInSrcDirs(dependencyLogicalName, srcDirs, exts).then(function (dep) {
              return _.find(knownDependencies, _.isEqual.bind(_, dep)) ? null : dep;
            })

          } else {
            return new Promise(function(resolve) { resolve(null) });
          }
        });

        Promise.all(promises).then(function(nestedValidDependencies) {
          var validDependencies = _.compact(_.flatten(nestedValidDependencies));
          var newDependencies = knownDependencies.concat(validDependencies);
          var recursePromises = _.compact(validDependencies.map(function(dependency) {
            return /\.(elmx?|jsx?)$/.test(dependency.file) ?
              findAllDependencies(dependency.file, newDependencies, srcDirs, exts) : null;
          }));

          Promise.all(recursePromises).then(function(extraDependencies) {
            resolve(_.uniq(_.flatten(newDependencies.concat(extraDependencies))));
          }).catch(reject);
        }).catch(reject);
      }
    });
  });
}

function elmxTarget(source, options) {
  if (typeof(options.outputDirectory) === 'string') {
    return path.join(options.outputDirectory, source.logical + '.elm')
  }
  return source.path + '.elm'
}

function elmxCompile(source, target) {
  return new Promise(function (resolve, reject) {
    fs.readFile(source, {encoding: "utf8"}, function(err, lines) {
      if (err) {
        reject(err);
      } else {
        mkdirp(path.dirname(target), function (err) {
          if (err) { reject(err) }
          else {
            fs.writeFile(target, elmxParser(lines), {encoding: 'utf8'}, function(err) {
              if(err) { reject(err) } else { resolve(target) }
            })
          }
        })
      }
    })
  });
}

function maybeCompileElmx(options, dependency) {
  return new Promise(function (resolve, reject) {
    var source = dependency.file;
    var target = elmxTarget(dependency, options);
    fs.stat(source, function (err, stats) {
      if ((err && err.code === "ENOENT") || !stats.isFile()) { reject(err); }
      else {
        fs.stat(target, function(err, tstats) {
          // compile only if modified
          if ((err && err.code === "ENOENT") ||
              (tstats.isFile() && stats.mtime.getTime() > tstats.mtime.getTime())) {
            elmxCompile(source, target).then(resolve, reject).catch(reject)
          } else {
            // dont recompile
            resolve(target)
          }
        })
      }
    })
  })
}

function compileElmxDeps(options, deps) {
  return Promise.all(
    _(deps)
      .filter(function (x) { return /\.elmx$/.test(x.file) })
      .map(maybeCompileElmx.bind(this, options))
      .value()
  );
}


module.exports = function(source, map) {
  this.cacheable && this.cacheable();

  var callback = this.async();

  if (!callback) {
    throw 'elmx-webpack-preloader currently only supports async mode.';
  }

  var input = getInput.call(this);
  var options = getOptions.call(this);

  var dependencies = Promise.resolve()
    .then(function() {
      if (!options.cache || cachedDependencies.length === 0) {
        return findAllDependencies(input, [], options.srcDirs, options.exts).then(addDependencies.bind(this));
      }
    }.bind(this));

  var err = function(error) {
    callback('Elmx preloader exited with error '+err)
  }

  dependencies.then(function (deps) {
    compileElmxDeps.bind(this, options)(deps).then(function (compiled) {
      callback(null, source, map)
    }.bind(this)).catch(err)
  }.bind(this)).catch(err)
}


