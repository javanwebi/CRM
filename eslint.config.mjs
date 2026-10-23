import js from '@eslint/js';
import ts from 'typescript-eslint';
import globals from 'globals';
export default ts.config({ignores:['**/dist/**','**/node_modules/**','.turbo/**','test-results/**']},js.configs.recommended,...ts.configs.recommended,{languageOptions:{globals:{...globals.node,...globals.browser}},rules:{'@typescript-eslint/no-explicit-any':'off','@typescript-eslint/no-unused-vars':['warn',{argsIgnorePattern:'^_',varsIgnorePattern:'^_'}]}});
