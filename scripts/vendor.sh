#!/bin/bash
# Download all external dependencies locally using npm
# Run this script once to vendor all dependencies

set -e

cd "$(dirname "$0")/.."

# Use absolute path for vendor directory
VENDOR_DIR="$(pwd)/frontend/vendored"
TEMP_DIR=$(mktemp -d)

echo "Creating vendor directory structure..."
mkdir -p "$VENDOR_DIR/codemirror"/{state,view,commands,autocomplete,language,language-data,lang-markdown,lint,search,theme-one-dark,lang-html,lang-css,lang-javascript,lang-angular,lang-cpp,lang-go,lang-java,lang-jinja,lang-json,lang-less,lang-liquid,lang-php,lang-python,lang-rust,lang-sass,lang-sql,lang-vue,lang-wast,lang-xml,lang-yaml,legacy-modes}
mkdir -p "$VENDOR_DIR/lezer"/{highlight,common,lr,markdown,html,css,javascript,cpp,go,java,json,php,python,rust,sass,xml,yaml}
mkdir -p "$VENDOR_DIR/@marijn/find-cluster-break"
mkdir -p "$VENDOR_DIR"/{w3c-keyname,style-mod}

echo "Setting up temporary npm project in $TEMP_DIR..."
cd "$TEMP_DIR"

# Create package.json with all required dependencies
cat > package.json << 'EOF'
{
  "name": "vendor-downloader",
  "private": true,
  "dependencies": {
    "@codemirror/state": "*",
    "@codemirror/view": "*",
    "@codemirror/commands": "*",
    "@codemirror/language": "*",
    "@codemirror/language-data": "*",
    "@codemirror/autocomplete": "*",
    "@codemirror/lang-markdown": "*",
    "@codemirror/lint": "*",
    "@codemirror/theme-one-dark": "*",
    "@codemirror/lang-html": "*",
    "@codemirror/lang-css": "*",
    "@codemirror/search": "*",
    "@codemirror/lang-javascript": "*",
    "@codemirror/lang-angular": "*",
    "@codemirror/lang-cpp": "*",
    "@codemirror/lang-go": "*",
    "@codemirror/lang-java": "*",
    "@codemirror/lang-jinja": "*",
    "@codemirror/lang-json": "*",
    "@codemirror/lang-less": "*",
    "@codemirror/lang-liquid": "*",
    "@codemirror/lang-php": "*",
    "@codemirror/lang-python": "*",
    "@codemirror/lang-rust": "*",
    "@codemirror/lang-sass": "*",
    "@codemirror/lang-sql": "*",
    "@codemirror/lang-vue": "*",
    "@codemirror/lang-wast": "*",
    "@codemirror/lang-xml": "*",
    "@codemirror/lang-yaml": "*",
    "@codemirror/legacy-modes": "*",
    "@lezer/highlight": "*",
    "@lezer/common": "*",
    "@lezer/lr": "*",
    "@lezer/markdown": "*",
    "@lezer/html": "*",
    "@lezer/css": "*",
    "@lezer/javascript": "*",
    "@lezer/cpp": "*",
    "@lezer/go": "*",
    "@lezer/java": "*",
    "@lezer/json": "*",
    "@lezer/php": "*",
    "@lezer/python": "*",
    "@lezer/rust": "*",
    "@lezer/sass": "*",
    "@lezer/xml": "*",
    "@lezer/yaml": "*",
    "@marijn/find-cluster-break": "*",
    "crelt": "*",
    "w3c-keyname": "*",
    "style-mod": "*"
  }
}
EOF

echo "Installing packages with npm..."
npm install --no-audit --no-fund 2>&1 | tail -20

echo "Copying dist files to vendor directory..."

# Function to copy dist files from node_modules to vendor
copy_dist() {
    local package_name=$1
    local target_dir=$2
    
    local src_dir="$TEMP_DIR/node_modules/$package_name/dist"
    local alt_src="$TEMP_DIR/node_modules/$package_name"
    
    # Check if dist/index.js exists (preferred ESM)
    if [ -f "$src_dir/index.js" ]; then
        cp -r "$src_dir"/* "$target_dir"/
        echo "  ✓ Copied $package_name to $target_dir"
    # Check for dist/index.es.js (ESM dist variant)
    elif [ -f "$src_dir/index.es.js" ]; then
        mkdir -p "$target_dir"
        cp "$src_dir/index.es.js" "$target_dir/index.js"
        cp "$src_dir/index.d.ts" "$target_dir/index.d.ts" 2>/dev/null || true
        echo "  ✓ Copied $package_name (dist es files) to $target_dir"
    # Check for index.js in root with ESM format (export statement)
    elif [ -f "$alt_src/index.js" ] && grep -q "export " "$alt_src/index.js" 2>/dev/null; then
        mkdir -p "$target_dir"
        cp "$alt_src/index.js" "$target_dir/index.js"
        cp "$alt_src/index.d.ts" "$target_dir/index.d.ts" 2>/dev/null || true
        echo "  ✓ Copied $package_name (root esm) to $target_dir"
    # Check for src/index.js (ESM source)
    elif [ -f "$alt_src/src/index.js" ]; then
        mkdir -p "$target_dir"
        cp "$alt_src/src/index.js" "$target_dir/index.js"
        cp "$alt_src/src/index.d.ts" "$target_dir/index.d.ts" 2>/dev/null || true
        echo "  ✓ Copied $package_name (src files) to $target_dir"
    # Check for index.js in root
    elif [ -f "$alt_src/index.js" ] || [ -f "$alt_src/index.mjs" ]; then
        mkdir -p "$target_dir" 2>/dev/null || true
        cp "$alt_src"/*.js "$target_dir"/ 2>/dev/null || true
        cp "$alt_src"/*.mjs "$target_dir"/ 2>/dev/null || true
        cp "$alt_src"/*.d.ts "$target_dir"/ 2>/dev/null || true
        echo "  ✓ Copied $package_name (root files) to $target_dir"
    # Fallback: Check for dist/index.cjs (convert to ESM for browser compatibility)
    elif [ -f "$src_dir/index.cjs" ]; then
        mkdir -p "$target_dir"
        cp "$src_dir/index.cjs" "$target_dir/index.js"
        cp "$src_dir/index.d.cts" "$target_dir/index.d.ts" 2>/dev/null || true
        echo "  ✓ Converted $package_name (cjs) to $target_dir"
    else
        echo "  ✗ Could not find dist files for $package_name"
        echo "    Checked: $src_dir, $alt_src"
    fi
}

# Copy all packages
copy_dist "@codemirror/state" "$VENDOR_DIR/codemirror/state"
copy_dist "@codemirror/view" "$VENDOR_DIR/codemirror/view"
copy_dist "@codemirror/commands" "$VENDOR_DIR/codemirror/commands"
copy_dist "@codemirror/lang-markdown" "$VENDOR_DIR/codemirror/lang-markdown"
copy_dist "@codemirror/autocomplete" "$VENDOR_DIR/codemirror/autocomplete"
copy_dist "@codemirror/language" "$VENDOR_DIR/codemirror/language"
copy_dist "@codemirror/language-data" "$VENDOR_DIR/codemirror/language-data"
copy_dist "@codemirror/lint" "$VENDOR_DIR/codemirror/lint"
copy_dist "@codemirror/theme-one-dark" "$VENDOR_DIR/codemirror/theme-one-dark"

copy_dist "@lezer/highlight" "$VENDOR_DIR/lezer/highlight"
copy_dist "@lezer/common" "$VENDOR_DIR/lezer/common"
copy_dist "@lezer/lr" "$VENDOR_DIR/lezer/lr"
copy_dist "@lezer/markdown" "$VENDOR_DIR/lezer/markdown"

copy_dist "@marijn/find-cluster-break" "$VENDOR_DIR/@marijn/find-cluster-break"

# crelt uses "import elt from 'crelt'" - needs default export
mkdir -p "$VENDOR_DIR/crelt"
if grep -q "export default" "$TEMP_DIR/node_modules/crelt/index.js" 2>/dev/null; then
    cp "$TEMP_DIR/node_modules/crelt/index.js" "$VENDOR_DIR/crelt/index.js"
    echo "  ✓ Copied crelt (esm) to $VENDOR_DIR/crelt"
else
    echo "  ✗ crelt index.js not ESM"
fi

copy_dist "w3c-keyname" "$VENDOR_DIR/w3c-keyname"

# style-mod uses src/style-mod.js for ESM
if [ -f "$TEMP_DIR/node_modules/style-mod/src/style-mod.js" ]; then
    mkdir -p "$VENDOR_DIR/style-mod"
    cp "$TEMP_DIR/node_modules/style-mod/src/style-mod.js" "$VENDOR_DIR/style-mod/index.js"
    cp "$TEMP_DIR/node_modules/style-mod/src/style-mod.d.ts" "$VENDOR_DIR/style-mod/index.d.ts" 2>/dev/null || true
    echo "  ✓ Copied style-mod to $VENDOR_DIR/style-mod"
else
    copy_dist "style-mod" "$VENDOR_DIR/style-mod"
fi

copy_dist "@codemirror/search" "$VENDOR_DIR/codemirror/search"
copy_dist "@codemirror/lang-html" "$VENDOR_DIR/codemirror/lang-html"
copy_dist "@codemirror/lang-css" "$VENDOR_DIR/codemirror/lang-css"
copy_dist "@codemirror/lang-javascript" "$VENDOR_DIR/codemirror/lang-javascript"
copy_dist "@codemirror/lang-angular" "$VENDOR_DIR/codemirror/lang-angular"
copy_dist "@codemirror/lang-cpp" "$VENDOR_DIR/codemirror/lang-cpp"
copy_dist "@codemirror/lang-go" "$VENDOR_DIR/codemirror/lang-go"
copy_dist "@codemirror/lang-java" "$VENDOR_DIR/codemirror/lang-java"
copy_dist "@codemirror/lang-jinja" "$VENDOR_DIR/codemirror/lang-jinja"
copy_dist "@codemirror/lang-json" "$VENDOR_DIR/codemirror/lang-json"
copy_dist "@codemirror/lang-less" "$VENDOR_DIR/codemirror/lang-less"
copy_dist "@codemirror/lang-liquid" "$VENDOR_DIR/codemirror/lang-liquid"
copy_dist "@codemirror/lang-php" "$VENDOR_DIR/codemirror/lang-php"
copy_dist "@codemirror/lang-python" "$VENDOR_DIR/codemirror/lang-python"
copy_dist "@codemirror/lang-rust" "$VENDOR_DIR/codemirror/lang-rust"
copy_dist "@codemirror/lang-sass" "$VENDOR_DIR/codemirror/lang-sass"
copy_dist "@codemirror/lang-sql" "$VENDOR_DIR/codemirror/lang-sql"
copy_dist "@codemirror/lang-vue" "$VENDOR_DIR/codemirror/lang-vue"
copy_dist "@codemirror/lang-wast" "$VENDOR_DIR/codemirror/lang-wast"
copy_dist "@codemirror/lang-xml" "$VENDOR_DIR/codemirror/lang-xml"
copy_dist "@codemirror/lang-yaml" "$VENDOR_DIR/codemirror/lang-yaml"
copy_dist "@lezer/html" "$VENDOR_DIR/lezer/html"
copy_dist "@lezer/css" "$VENDOR_DIR/lezer/css"
copy_dist "@lezer/javascript" "$VENDOR_DIR/lezer/javascript"
copy_dist "@lezer/cpp" "$VENDOR_DIR/lezer/cpp"
copy_dist "@lezer/go" "$VENDOR_DIR/lezer/go"
copy_dist "@lezer/java" "$VENDOR_DIR/lezer/java"
copy_dist "@lezer/json" "$VENDOR_DIR/lezer/json"
copy_dist "@lezer/php" "$VENDOR_DIR/lezer/php"
copy_dist "@lezer/python" "$VENDOR_DIR/lezer/python"
copy_dist "@lezer/rust" "$VENDOR_DIR/lezer/rust"
copy_dist "@lezer/sass" "$VENDOR_DIR/lezer/sass"
copy_dist "@lezer/xml" "$VENDOR_DIR/lezer/xml"
copy_dist "@lezer/yaml" "$VENDOR_DIR/lezer/yaml"

# @codemirror/legacy-modes ships browser-ready ESM files directly in mode/.
mkdir -p "$VENDOR_DIR/codemirror/legacy-modes/mode"
cp "$TEMP_DIR/node_modules/@codemirror/legacy-modes/mode/"*.js "$VENDOR_DIR/codemirror/legacy-modes/mode/"
cp "$TEMP_DIR/node_modules/@codemirror/legacy-modes/mode/"*.d.ts "$VENDOR_DIR/codemirror/legacy-modes/mode/"

# Browser import maps do not apply Node's extension resolution. Make the
# language-data package reference the vendored legacy ESM files explicitly.
LANGUAGE_DATA="$VENDOR_DIR/codemirror/language-data/index.js"
sed -E "s|(@codemirror/legacy-modes/mode/[A-Za-z0-9-]+)'|\\1.js'|g" "$LANGUAGE_DATA" > "$LANGUAGE_DATA.tmp"
mv "$LANGUAGE_DATA.tmp" "$LANGUAGE_DATA"

# Download theme CSS separately (not in npm package)
echo "Downloading theme CSS..."
curl -sL "https://cdn.jsdelivr.net/npm/@codemirror/theme-one-dark@6/dist/style.min.css" \
    -o "$VENDOR_DIR/codemirror/theme-one-dark/style.min.css"

# Verify the CSS downloaded
if [ ! -f "$VENDOR_DIR/codemirror/theme-one-dark/style.min.css" ] || [ ! -s "$VENDOR_DIR/codemirror/theme-one-dark/style.min.css" ]; then
    echo "  Warning: Theme CSS download may have failed, creating minimal fallback"
    cat > "$VENDOR_DIR/codemirror/theme-one-dark/style.min.css" << 'CSS_EOF'
/* Minimal fallback theme */
.cm-editor { background: #1e1e1e; color: #dcddde; }
.cm-gutters { background: #1e1e1e; border-right: 1px solid #2d2d2d; }
.cm-cursor { border-left-color: #5865f2; }
.cm-selectionBackground, .cm-content ::selection { background: #3a3f4b; }
.cm-lineNumbers .cm-gutterElement { color: #4f545c; }
.cm-activeLineGutter { background: #2f3136; }
CSS_EOF
fi

# Cleanup temp directory
cd - > /dev/null
rm -rf "$TEMP_DIR"

echo "Creating import map for local modules..."
cat > "$VENDOR_DIR/importmap.json" << 'EOF'
{
  "imports": {
    "@codemirror/state": "./codemirror/state/index.js",
    "@codemirror/view": "./codemirror/view/index.js",
    "@codemirror/commands": "./codemirror/commands/index.js",
    "@codemirror/lang-markdown": "./codemirror/lang-markdown/index.js",
    "@codemirror/autocomplete": "./codemirror/autocomplete/index.js",
    "@codemirror/language": "./codemirror/language/index.js",
    "@codemirror/language-data": "./codemirror/language-data/index.js",
    "@codemirror/lint": "./codemirror/lint/index.js",
    "@codemirror/search": "./codemirror/search/index.js",
    "@codemirror/theme-one-dark": "./codemirror/theme-one-dark/index.js",
    "@codemirror/lang-html": "./codemirror/lang-html/index.js",
    "@codemirror/lang-css": "./codemirror/lang-css/index.js",
    "@codemirror/lang-javascript": "./codemirror/lang-javascript/index.js",
    "@codemirror/lang-angular": "./codemirror/lang-angular/index.js",
    "@codemirror/lang-cpp": "./codemirror/lang-cpp/index.js",
    "@codemirror/lang-go": "./codemirror/lang-go/index.js",
    "@codemirror/lang-java": "./codemirror/lang-java/index.js",
    "@codemirror/lang-jinja": "./codemirror/lang-jinja/index.js",
    "@codemirror/lang-json": "./codemirror/lang-json/index.js",
    "@codemirror/lang-less": "./codemirror/lang-less/index.js",
    "@codemirror/lang-liquid": "./codemirror/lang-liquid/index.js",
    "@codemirror/lang-php": "./codemirror/lang-php/index.js",
    "@codemirror/lang-python": "./codemirror/lang-python/index.js",
    "@codemirror/lang-rust": "./codemirror/lang-rust/index.js",
    "@codemirror/lang-sass": "./codemirror/lang-sass/index.js",
    "@codemirror/lang-sql": "./codemirror/lang-sql/index.js",
    "@codemirror/lang-vue": "./codemirror/lang-vue/index.js",
    "@codemirror/lang-wast": "./codemirror/lang-wast/index.js",
    "@codemirror/lang-xml": "./codemirror/lang-xml/index.js",
    "@codemirror/lang-yaml": "./codemirror/lang-yaml/index.js",
    "@codemirror/legacy-modes/mode/": "./codemirror/legacy-modes/mode/",
    "@lezer/highlight": "./lezer/highlight/index.js",
    "@lezer/common": "./lezer/common/index.js",
    "@lezer/lr": "./lezer/lr/index.js",
    "@lezer/markdown": "./lezer/markdown/index.js",
    "@lezer/html": "./lezer/html/index.js",
    "@lezer/css": "./lezer/css/index.js",
    "@lezer/javascript": "./lezer/javascript/index.js",
    "@lezer/cpp": "./lezer/cpp/index.js",
    "@lezer/go": "./lezer/go/index.js",
    "@lezer/java": "./lezer/java/index.js",
    "@lezer/json": "./lezer/json/index.js",
    "@lezer/php": "./lezer/php/index.js",
    "@lezer/python": "./lezer/python/index.js",
    "@lezer/rust": "./lezer/rust/index.js",
    "@lezer/sass": "./lezer/sass/index.js",
    "@lezer/xml": "./lezer/xml/index.js",
    "@lezer/yaml": "./lezer/yaml/index.js",
    "@marijn/find-cluster-break": "./@marijn/find-cluster-break/index.js",
    "crelt": "./crelt/index.js",
    "w3c-keyname": "./w3c-keyname/index.js",
    "style-mod": "./style-mod/index.js",
    "codemirror-markdown-tables": "./codemirror-markdown-tables/index.js"
  }
}
EOF

echo "Bundling locally vendored Markdown-It plugins..."
node scripts/vendor-markdown-renderer.mjs

echo "Bundling codemirror-markdown-tables with its non-CodeMirror dependencies..."
mkdir -p "$VENDOR_DIR/codemirror-markdown-tables"
./node_modules/.bin/esbuild node_modules/codemirror-markdown-tables/dist/codemirror-markdown-tables.js \
    --bundle \
    --format=esm \
    --target=es2020 \
    --minify \
    --external:@codemirror/* \
    --external:@lezer/* \
    --outfile="$VENDOR_DIR/codemirror-markdown-tables/index.js"

echo "Verifying downloads..."
echo "  Theme CSS: $([ -f "$VENDOR_DIR/codemirror/theme-one-dark/style.min.css" ] && echo "✓" || echo "✗")"
echo "  View: $([ -f "$VENDOR_DIR/codemirror/view/index.js" ] && echo "✓" || echo "✗")"
echo "  State: $([ -f "$VENDOR_DIR/codemirror/state/index.js" ] && echo "✓" || echo "✗")"
echo "  Language: $([ -f "$VENDOR_DIR/codemirror/language/index.js" ] && echo "✓" || echo "✗")"
echo "  Lang-Markdown: $([ -f "$VENDOR_DIR/codemirror/lang-markdown/index.js" ] && echo "✓" || echo "✗")"

# Count total files
JS_COUNT=$(find "$VENDOR_DIR" -name "*.js" -type f | wc -l)
CSS_COUNT=$(find "$VENDOR_DIR" -name "*.css" -type f | wc -l)
echo ""
echo "Total JS files: $JS_COUNT"
echo "Total CSS files: $CSS_COUNT"

echo ""
echo "✓ Vendor download complete!"
echo "  Run this script once, then use the local imports in your code."
echo "  If any modules failed to download, the app will fall back to CDN."
