# elmx-webpack-preloader

Compile [elmx](https://github.com/pzavolinsky/elmx) to elm files before using [elm-webpack-loader](https://github.com/rtfeldman/elm-webpack-loader)

[Example App](https://github.com/vic/elmx-webpack-boilerplate)

## Installation

```shell
npm install --save-dev elmx-webpack-preloader
```

## Usage

Add the preload to your webpack config.
Any `.elmx` dependency will be compiled to an `.elm` file.

If no `outputDirectory` is specified, the compiled elm will be placed
in the same directory as it's elmx source.

```javascript
{
  module: {
    preLoaders: [
      {
        // Notice that the preloader actually reads .elm files looking for dependencies to be compiled from elmx
        test: /\.elm$/,
        loader: 'elmx-webpack-preloader',
        include: [join(__dirname, "src/elm")],
        query: {
          sourceDirectories: ['src/elm']
          outputDirectory: '.tmp/elm'
        }
      }
    ],
    loaders: [
      {
        test: /\.elm$/,
        loader: 'elm-webpack',
        include: [join(__dirname, "src/elm"), join(__dirname, ".tmp/elm")]
      }
    ]
  }
}
```

When using an `outputDirectory` make sure to include it on your `elm-package.json`

```json
{
    "source-directories": [
        "src/elm",
        ".tmp/elm"
    ]
}
```
