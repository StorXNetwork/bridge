StorX Bridge
=======================================================================================================

[![Build Status](https://travis-ci.com/StorX/Bridge.svg?branch=master)](https://travis-ci.com/StorX/Bridge)

Quick Start
-----------

Install MongoDB, Git, Wget and build-essential:

```
apt-get install mongodb redis-server git wget build-essential
```

Install [NVM][nvmsite], Node.js and NPM:

```
wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.34.0/install.sh | bash
source ~/.profile
nvm install 10.19
```

Clone the repository, install dependencies:

```
git clone https://github.com/StorXNetwork/bridge.git && cd bridge
npm install && npm link
```

Start the server (set the `NODE_ENV` environment variable to specify the config):

```
NODE_ENV=develop StorX-bridge
```

> **Note:** StorX Bridge cannot communicate with the network on it's own, but 
> instead must communicate with a running 
> [StorX Complex](https://github.com/StorXNetwork/complex) instance.

This will use the configuration file located at `~/.storx-bridge/config/develop.json`.

Windows
-------

Install utilizing automated script

```
https://github.com/Storj/storj-automation/archive/master.zip
```

The default configuration can be modified as needed.  It is located at

```
%USERPROFILE%\.storx-bridge\config
```


Terms
-----

This software is released for testing purposes only. We make no guarantees with
respect to its function. By using this software you agree that StorX is not
liable for any damage to your system. You also agree not to upload illegal
content, content that infringes on other's IP, or information that would be
protected by HIPAA, FERPA, or any similar standard. Generally speaking, you
agree to test the software responsibly. We'd love to hear feedback too.

 [nvmsite]: <https://github.com/nvm-sh/nvm>
