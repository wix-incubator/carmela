// See https://babeljs.io/docs/en/config-files#project-wide-configuration
module.exports = api => {
    const env = api.env()

    const config = {
        // default presets and plugins for every package
        presets: ['@babel/preset-react'],
        plugins: [
            '@babel/plugin-proposal-class-properties', 
            '@babel/plugin-syntax-dynamic-import',
            '@babel/plugin-transform-modules-commonjs', 
            ['@babel/plugin-transform-typescript', {isTSX: true}]
        ],

        babelrcRoots: [
            // keep the root as a root
            __dirname,

            // also consider monorepo packages "root" and load their .babelrc files.
            '{,!(node_modules)*}'
        ]
    }

    // optimize to specific envs
    // transpile for all targets by default;
    let targets
    switch (env) {
        // always transpile to current node for tests
        case 'test':
            targets = 'current node'
            break
        // transpile to modern browsers for faster development
        case 'development':
            targets = 'last 2 chrome versions, last 2 safari versions, last 2 firefox versions'
            break
        case 'production':
            // defining explicitly
            targets = '> 0.5%, last 2 versions, Firefox ESR, not dead, ie >= 11'
            break
    }
    config.presets.push(['@babel/preset-env', {targets}])
    return config
}
