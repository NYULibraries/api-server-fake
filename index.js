const axios     = require( 'axios' );
const crypto    = require( 'crypto' );
const fs        = require( 'fs' );
const http      = require( 'http' );
const moment    = require( 'moment' );
const path      = require( 'path' );
const url       = require( 'url' );

const { createLogger, format, transports } = require( 'winston' );
const { combine, timestamp, label, printf } = format;

const stringify = require( 'json-stable-stringify' );

const DEFAULT_PORT = 3000;

const INDEX_FILE = 'index.json';

let serverResponses;
let serverResponsesIndex;
let serverResponsesDirectory;
let updateServerResponsesServerServerUrl;

const customFormat = printf( info => {
    const timestamp = timestampEST();

    return `${ timestamp } [${ info.level }]: ${ info.message }`;
} );

const logdir = path.join( '/tmp', 'server-fake-logs/' );

if ( ! fs.existsSync( logdir ) ) {
    fs.mkdirSync( logdir );
}

const logfile = getLogfile( logdir );

// This logger is closed over by the process.on(...) handlers, so this is in
// global scope where where the handlers are defined.
const logger = createLogger( {
                                 level : 'info',
                                 format: customFormat,
                                 transports : [
                                     new transports.File( { filename : logfile } ),
                                 ],
                             } );

function exitHandler( code ) {
    const timestamp = timestampEST();

    logger.info( `Exited with code ${ code } at ${ timestamp }` );
};

function getLogfile( logdir ) {
    return path.join(
        logdir,
        'server-fake-' + moment( new Date() ).format( 'YYYY-MM-DDTHH-mm-ss' )
    ) + '.log';
}

function getServerResponseFilename( queryString ) {
    const hash = crypto.createHmac( 'sha256', queryString )
        .update( queryString )
        .digest( 'hex' );

    return `${ hash }.json`;
}

function getServerResponseFilePath( responseFile ) {
    return path.join( serverResponsesDirectory, responseFile )
}

async function getServerResponseFromLiveServer( queryString ) {
    try {
        const request = updateServerResponsesServerServerUrl + queryString;

        const response = await axios.get( request );

        return response.data;
    } catch( error ) {
        logger.error( error );
    }
}

function getServerResponses() {
    const data = {};

    const index = require( serverResponsesIndex );

    Object.keys( index ).forEach( queryString => {
        const file = getServerResponseFilePath( index[ queryString ] );

        const response = require( file );

        data[ normalizeQueryString( queryString ) ] = response;
    } );

    return data;
}

function normalHandler( request, response ) {
    const requestUrl = url.parse( request.url );

    const queryString = requestUrl.search;

    if ( ! queryString ) {
        return;
    }

    const normalizedQueryString = normalizeQueryString( queryString );

    let serverResponse = serverResponses[ normalizedQueryString ];

    if ( ! serverResponse ) {
        const errorMessage = `Query string "${ queryString }" not found in index`;

        serverResponse = {
            error : errorMessage,
        };

        logger.error( errorMessage );
    }

    const serverResponseString = stringify( serverResponse, { space: '    ' } );

    response.writeHead( 200, {
        "Access-Control-Allow-Origin" : "*",
        "Content-Type"                : "text/plain;charset=utf-8",
    } );

    response.write( serverResponseString );

    logger.info( `request = "${ queryString }` );

    response.end();
}

function normalizeQueryString( queryString ) {
    const urlSearchParams = new URLSearchParams( decodeURI( queryString ) );

    urlSearchParams.sort();

    return '?' + urlSearchParams.toString();
}

function signalEventHandler( signal, code ) {
    const timestamp = moment( new Date() ).format( "ddd, D MMM YYYY H:m:s " ) + 'EST';

    logger.info( `Received ${ signal } at ${ timestamp }` );

    process.exit( code );
}

function startServerFake( options ) {

    console.log( 'Logging to ' + logfile );

    if ( options.verbose ) {
        logger.add( new transports.Console() );
    }

    serverResponsesDirectory = options.serverResponsesDirectory;
    serverResponsesIndex = path.resolve( serverResponsesDirectory, INDEX_FILE );

    const port = options.port || DEFAULT_PORT;

    let handler;
    if ( options.updateServerResponsesServerServerUrl  ) {
        updateServerResponsesServerServerUrl = options.updateServerResponsesServerServerUrl;

        logger.info( 'Switching to update Server responses mode' );
        logger.info( `Server server = ${ updateServerResponsesServerServerUrl }` );

        handler = updateServerResponsesHandler;
    } else {
        serverResponses = getServerResponses( serverResponsesIndex, serverResponsesDirectory );

        handler = normalHandler;
    }

    http.createServer( handler ).listen( port )
        .on( 'listening', () => {
            logger.info( 'Server fake is running on port ' + port );
        } )
        .on( 'error', ( e ) => {
            logger.error( `HTTP server error: ${ e }` );
        } );

    process.on( 'SIGINT', signalEventHandler );
    process.on( 'SIGTERM', signalEventHandler );
    process.on( 'exit', exitHandler );
}

function stableStringify( data ) {
    return stringify( data, { space : '    ' } );
}

function updateServerResponses( queryString, serverResponse ) {
    const index = fs.existsSync( serverResponsesIndex ) ?
                      require( serverResponsesIndex )   :
                      {};

    const responseFilename = getServerResponseFilename( queryString );
    const responseFilePath = getServerResponseFilePath( responseFilename );

    index[ queryString ] = responseFilename;

    fs.writeFileSync( responseFilePath, serverResponse );

    fs.writeFileSync( serverResponsesIndex, stableStringify( index ) );

    logger.info( `Updated Server response "${ queryString }" : ${ responseFilename }` );
}

async function updateServerResponsesHandler( request, response ) {
    const requestUrl = url.parse( request.url );

    const queryString = requestUrl.search;

    if ( ! queryString ) {
        return;
    }

    const normalizedQueryString = normalizeQueryString( queryString );

    const serverResponse = await getServerResponseFromLiveServer( normalizedQueryString );

    const serverResponseString = stableStringify( serverResponse );

    updateServerResponses( normalizedQueryString, serverResponseString );

    response.writeHead( 200, {
        "Access-Control-Allow-Origin" : "*",
        "Content-Type"                : "text/plain;charset=utf-8",
    } );

    response.write( serverResponseString );
    response.end();
}

function timestampEST() {
    return moment( new Date() ).format( 'ddd, D MMM YYYY H:m:s ' ) + 'EST';
}

module.exports.startServerFake = startServerFake;
