const fs = require( 'fs' );

const argv = require( 'minimist' )( process.argv.slice( 2 ) );

const serverFake = require( './' );

let serverResponsesDirectory = argv._[ 0 ];
if ( serverResponsesDirectory ) {
    serverResponsesDirectory = fs.realpathSync( serverResponsesDirectory );
}

const port = argv.port || undefined;

const normalizeQueryStringsInIndex = argv[ 'normalize-query-strings-in-index' ] || false;

const verbose = argv.verbose || undefined;

const updateServerResponsesServerUrl = argv[ 'update-responses-server-url' ] || undefined;

serverFake.startServerFake(
    {
        normalizeQueryStringsInIndex,
        serverResponsesDirectory,
        port,
        updateServerResponsesServerUrl,
        verbose,
    }
);
