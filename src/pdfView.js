import { h, render, createRef, Fragment, Component } from 'preact';
import * as PDFJS from "pdfjs-dist/webpack"
import * as Matrix from "matrix-js-sdk"
import * as Layout from "./layout.js"
import AnnotationLayer from "./annotation.js"
import { eventVersion }  from "./constants.js"

export default class PdfView extends Component {

    static PDFStore = {} 
    //we store downloaded PDFs here in order to avoid excessive downloads. 
    //Could alternatively use localstorage or some such eventually. We don't
    //use preact state since changes here aren't relevent to UI.

    annotationLayer = createRef()

    constructor(props) {
        super(props)
        this.state = { 
            pdfIdentifier : null,
            roomId : null,
            focus: null
        }
    }

    setId = id => this.setState({roomId : id})

    openAnnotation = _ => {
        var theSelection = window.getSelection()
        if (theSelection.isCollapsed) return
        var theRange = theSelection.getRangeAt(0)
        var clientRects = Array.from(theRange.getClientRects())
                               .map(rect => Layout.rectRelativeTo(this.annotationLayer.current.base, rect))
        var uuid = Math.random().toString(36).substring(2)
        //room creation is a bit slow, might want to rework this slightly for responsiveness
        this.props.client.createRoom({ 
            room_alias_name : "room" + uuid,
            name : "room" + uuid,
            visibility : "public",
            topic : "bloviating",
            initial_state : [{
                "type": "m.room.join_rules",
                "state_key":"",
                "content": {"join_rule": "public"}
            }]
        }).then(_ => {
            this.props.client.sendStateEvent(this.state.roomId, eventVersion, {
                uuid : uuid, 
                clientRects : JSON.stringify(clientRects),
                activityStatus: "open",
                pageNumber : this.props.pageFocused
            }, uuid)
        })
    }

    closeAnnotation = _ => {
        this.props.client.sendStateEvent(this.state.roomId, eventVersion, {
            "uuid": this.state.focus.uuid, 
            "clientRects": this.state.focus.clientRects,
            "activityStatus": "closed"
        }, this.state.focus.uuid)
    }

    setFocus = content => this.setState({focus : content})

    render(props,state) {
        return (
            <div id="content-container">
                <div id="document-view">
                    <PdfCanvas annotationLayer={this.annotationLayer}
                               pdfFocused={props.pdfFocused}
                               pageFocused={props.pageFocused}
                               setId={this.setId}
                               client={props.client}/>
                    <AnnotationLayer ref={this.annotationLayer} 
                                     page={props.pageFocused} 
                                     roomId={state.roomId} 
                                     setFocus={this.setFocus}
                                     focus={state.focus}
                                     client={props.client}/>
                </div>
                <div>
                    <button onclick={_ => props.loadPage(props.pageFocused + 1)}>Next</button>
                    <button onclick={_ => props.loadPage(props.pageFocused - 1)}>Prev</button>
                    <button onclick={this.openAnnotation}>Add Annotation</button>
                    {state.focus && <button onclick={this.closeAnnotation}>Remove Annotation</button>}
                </div>
            </div>
        )
    }
}

class PdfCanvas extends Component {

    constructor(props) {
        super(props)
        this.pendingRender = null
        this.hasRendered = false //we allow one initial render, but then require a page change for a redraw
        let syncListener = (state,prevState,data) =>
                state == "PREPARED" 
                ? this.fetchPdf(props.pdfFocused)
                : props.client.off("sync", syncListener)
        if (props.client.isInitialSyncComplete()) this.fetchPdf(props.pdfFocused) 
        else props.client.on("sync", syncListener)
    }

    textLayer = createRef()

    canvas = createRef()

    fetchPdf (title) {
        var theId
        this.props.client
             .getRoomIdForAlias("#" + title + ":localhost")
             .then(id => {
                 theId = id.room_id
                 this.props.client.joinRoom(theId)
             }).then(_ => {
                 this.props.setId(theId)
                 const theRoom = this.props.client.getRoom(theId)
                 const theRoomState = theRoom.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
                 const pdfIdentifier = theRoomState.getStateEvents("org.populus.pdf","").getContent().identifier
                 const pdfPath = 'http://localhost:8008/_matrix/media/r0/download/localhost/' + pdfIdentifier
                 this.setState({pdfIdentifier : pdfIdentifier})
                 if (!PdfView.PDFStore[pdfIdentifier]) {
                     console.log('fetched ' + title )
                     PdfView.PDFStore[pdfIdentifier] = PDFJS.getDocument(pdfPath).promise
                 }
             })
    }

    drawPdf () {
        const theCanvas = this.canvas.current
        try {this.pendingRender._internalRenderTask.cancel()} catch {}
        PdfView.PDFStore[this.state.pdfIdentifier].then(pdf => {
              //Lock navigation
              this.navLock = true
              // Fetch the first page
                pdf.getPage(this.props.pageFocused || 1).then(page => {
                console.log('Page loaded');
              
                var scale = 1.5;
                var viewport = page.getViewport({scale: scale});

                // Prepare canvas using PDF page dimensions
                var context = theCanvas.getContext('2d');
                theCanvas.height = viewport.height;
                theCanvas.width = viewport.width;

                // Render PDF page into canvas context
                var renderContext = {
                  canvasContext: context,
                  viewport: viewport
                };

                this.pendingRender = page.render(renderContext);
                this.pendingRender.promise.then(_ => {
                  console.log('Page rendered');
                  return page.getTextContent();
                }).then(text => {
                   
                  //resize the text and annotation layers to sit on top of the rendered PDF page

                  Layout.positionAt(theCanvas.getBoundingClientRect(), this.textLayer.current);
                  Layout.positionAt(theCanvas.getBoundingClientRect(), this.props.annotationLayer.current.base);

                  //insert the pdf text into the text layer
                  PDFJS.renderTextLayer({
                      textContent: text,
                      container: document.getElementById("text-layer"),
                      viewport: viewport,
                      textDivs: []
                  });
                }).then(_ => { this.hasRendered = true })
              });
        })
    }

    shouldComponentUpdate(nextProps) {
        return (!this.hasRendered || (nextProps.pageFocused != this.props.pageFocused))
    }

    componentDidUpdate(prevProps, prevState, snapshot) {
        this.textLayer.current.innerHTML = ""
        this.drawPdf()
    }

    componentDidMount() {
        this.textLayer.current.addEventListener('click', event => {
            const mouseEvent = new MouseEvent(event.type, event)
            document.elementsFromPoint(event.clientX, event.clientY).forEach(elt => {
                if (elt.hasAttribute("data-annotation")) elt.dispatchEvent(mouseEvent)
            })
        })
    }

    render(props,state) {
        return (
            <Fragment>
                <canvas ref={this.canvas} data-page={props.pageFocused} id="pdf-canvas"/>
                <div style="z-index:3" ref={this.textLayer} id="text-layer"/>
            </Fragment>
        )
    }
}
