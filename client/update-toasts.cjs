const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

walkDir('./src', function(filePath) {
  if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
    let content = fs.readFileSync(filePath, 'utf8');
    let hasChanges = false;
    
    // Check for single quotes
    if (content.includes("import toast from 'react-hot-toast'")) {
      content = content.replace(/import toast from 'react-hot-toast';?/g, "import toast from '@/lib/toast';");
      hasChanges = true;
    }
    
    // Check for double quotes
    if (content.includes('import toast from "react-hot-toast"')) {
      content = content.replace(/import toast from "react-hot-toast";?/g, "import toast from '@/lib/toast';");
      hasChanges = true;
    }

    if (hasChanges) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log('Updated', filePath);
    }
  }
});
