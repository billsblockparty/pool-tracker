#!/bin/sh
# Stamp index.html's script URLs with a hash of calc.js + app.js, so a page only ever loads the scripts it shipped with.
# Run before every commit that changes calc.js or app.js.
set -e
cd "$(dirname "$0")/.."
v=$(cat calc.js app.js | sha1sum | cut -c1-8)
sed -i -E "s#<script src=\"calc\.js(\?v=[0-9a-f]+)?\"></script>#<script src=\"calc.js?v=$v\"></script>#; s#<script src=\"app\.js(\?v=[0-9a-f]+)?\"></script>#<script src=\"app.js?v=$v\"></script>#" index.html
echo "assets v=$v"
