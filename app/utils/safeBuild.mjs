#!/usr/bin/env node

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

/**
 * Safe build: compile into dist_tmp, optional path-alias rewrite, then atomically replace dist.
 * Leaves the previous dist in place if the build fails (useful for zero-downtime redeploys).
 */
async function safeBuild() {
    const distPath = path.join(projectRoot, 'dist');
    const distTmpPath = path.join(projectRoot, 'dist_tmp');

    try {
        console.log('🚀 Building into temporary folder...');

        if (fs.existsSync(distTmpPath)) {
            fs.rmSync(distTmpPath, { recursive: true, force: true });
        }

        execSync('npx tsc --outDir dist_tmp', {
            stdio: 'inherit',
            cwd: projectRoot,
        });

        const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
        const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
        const hasPaths =
            tsconfig.compilerOptions?.paths &&
            Object.keys(tsconfig.compilerOptions.paths).length > 0;

        if (hasPaths) {
            console.log('🔧 Rewriting path aliases using tsc-alias...');
            execSync('npx tsc-alias -p tsconfig.json --outDir dist_tmp', {
                stdio: 'inherit',
                cwd: projectRoot,
            });
        }

        console.log('✅ Build successful. Replacing dist...');

        if (fs.existsSync(distPath)) {
            fs.rmSync(distPath, { recursive: true, force: true });
        }

        fs.renameSync(distTmpPath, distPath);

        console.log('🎉 Deployment-ready build generated!');
        console.log(`📁 Build output: ${distPath}`);

        const serverFile = path.join(distPath, 'app.js');
        if (!fs.existsSync(serverFile)) {
            throw new Error('Build verification failed: app.js not found');
        }

        console.log('✅ Build verification passed');
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('❌ Build failed. Keeping existing dist folder.');
        console.error('Error details:', message);

        if (fs.existsSync(distTmpPath)) {
            fs.rmSync(distTmpPath, { recursive: true, force: true });
        }

        if (fs.existsSync(distPath)) {
            console.log('📁 Old dist folder preserved for continued operation');
        } else {
            console.log('⚠️  No existing dist folder found');
        }

        process.exit(1);
    }
}

function cleanupTmp() {
    const distTmpPath = path.join(projectRoot, 'dist_tmp');
    if (fs.existsSync(distTmpPath)) {
        fs.rmSync(distTmpPath, { recursive: true, force: true });
    }
}

process.on('SIGINT', () => {
    console.log('\n🛑 Build interrupted. Cleaning up...');
    cleanupTmp();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Build terminated. Cleaning up...');
    cleanupTmp();
    process.exit(0);
});

safeBuild().catch((error) => {
    console.error('💥 Unexpected error during build:', error);
    process.exit(1);
});
