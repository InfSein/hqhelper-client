# HqHelper Client
[![GitHub Release](https://img.shields.io/github/v/release/InfSein/hqhelper-client?style=flat&logo=github)](https://github.com/InfSein/hqhelper-client/releases) [![GitHub Downloads (all assets, all releases)](https://img.shields.io/github/downloads/InfSein/hqhelper-client/total?style=flat&logo=github)](https://github.com/InfSein/hqhelper-client/releases)

The Electron client designed for [HqHelper](https://github.com/InfSein/hqhelper-dawntrail) .

## Use client

Download in [Download Page](https://infsein.github.io/hqhelper-dawntrail/#/download),

Or in [Latest Release](https://github.com/InfSein/hqhelper-client/releases).

## Build Guideline

### Pull and Install

```bash
git clone https://github.com/InfSein/hqhelper-client.git
cd hqhelper-client
npm i
git submodule update --init --recursive
cd hqhelper
npm i
cd ..
npm run hqhelper-build
```

### Run dev

> [!TIP]\
> Run after `Pull and Install`

```bash
npm run electron-start
```

#### Hot-Reload during dev

```bash
npm run hqhelper-build
```

### Build client

> [!TIP]\
> Run after `Pull and Install`

```bash
npm run electron-build
```