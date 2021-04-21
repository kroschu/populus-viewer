import { h, createRef, render, Fragment, Component } from 'preact';
import { pdfStateType }  from "./constants.js"
import * as Matrix from "matrix-js-sdk"
import UserColor from './userColors.js'
import * as Icons from './icons.js'
import { eventVersion, serverRoot }  from "./constants.js"
import './styles/welcome.css'

export default class WelcomeView extends Component {

    constructor(props) {
        super(props)
        const userId = props.client.getUserId()
        this.user = props.client.getUser(props.client.getUserId())
        this.userColor = new UserColor(userId)
        this.profileListener = this.profileListener.bind(this)
        this.state = {
            uploadVisible : false,
            profileVisible : false,
            inputFocus : false,
            searchFilter : "",
            avatarUrl : Matrix.getHttpUriForMxc(serverRoot, this.user.avatarUrl, 30, 30, "crop"),
        }
    }

    componentDidMount () { this.user.on("User.avatarUrl", this.profileListener) }

    componentWillUnmount () { this.user.off("User.avatarUrl", this.profileListener) }

    profileListener () {
        this.setState({
            avatarUrl : Matrix.getHttpUriForMxc(serverRoot, this.user.avatarUrl, 30, 30, "crop"),
        })
    }

    toggleUploadVisible = _ => this.setState({
        uploadVisible : !this.state.uploadVisible,
        profileVisible : false,
    })

    toggleProfileVisible = _ => this.setState({
        uploadVisible : false,
        profileVisible : !this.state.profileVisible,
    })

    showMainView = _ => this.setState({
        uploadVisible : false,
        profileVisible : false,
    })

    handleInputFocus = _ => this.setState({
        inputFocus : true, 
        uploadVisible : false,
        profileVisible : false,
    })

    handleInputBlur = _ => this.setState({inputFocus: false})

    handleInput = e => {
        this.setState({searchFilter : e.target.value})
    }

    render(props,state) {
        return (
            <Fragment>
                <header id="welcome-header">
                    <div id="welcome-header-content">
                        <div id="welcome-search">
                            <input value={state.searchFilter} oninput={this.handleInput} onblur={this.handleInputBlur} onfocus={this.handleInputFocus} id="welcome-search-input"/>
                            {Icons.search}
                        </div>
                        { !state.inputFocus && <Fragment>
                            <div id="welcome-upload" onclick={this.toggleUploadVisible}>{Icons.newFile}</div>
                            <div id="welcome-profile" onclick={this.toggleProfileVisible} style={this.userColor.styleVariables} >
                                {state.avatarUrl 
                                    ? <img id="welcome-img" src={state.avatarUrl}/> 
                                    : <div id="welcome-initial">{this.user.displayName.slice(0,1)}</div>
                                }
                            </div>
                        </Fragment>}
                    </div>
                </header>
                <div id="welcome-container">
                    {state.uploadVisible 
                        ? <Fragment>
                            <h2>Upload a new PDF</h2>
                            <PdfUpload showMainView={this.showMainView} client={props.client}/>
                        </Fragment>
                        : state.profileVisible 
                            ? <Fragment>
                                <h2>Update Your Profile</h2>
                                <ProfileInfomation showMainView={this.showMainView} client={props.client}/>
                            </Fragment>
                            : <Fragment>
                                <h2>Conversations</h2>
                                <RoomList queryParams={props.queryParams} searchFilter={state.searchFilter} {...props}/>
                            </Fragment>
                    }
                    <Logout logoutHandler={props.logoutHandler}/>
                </div>
            </Fragment>
        )
    }
}

class RoomList extends Component {
    constructor(props) {
        super(props)
        this.state = {
            rooms : props.client.getVisibleRooms()
        }
        //need to do this to bind "this" as refering to the RoomList component in the listener
        this.roomListener = this.roomListener.bind(this)
    }

    roomListener (room) { this.setState({ rooms : this.props.client.getVisibleRooms() }) }

    componentDidMount () { 
        this.props.client.on("Room", this.roomListener) 
        this.props.client.on("Room.name", this.roomListener) 
        this.props.client.on("RoomState.events", this.roomListener)
        //State events might cause excessive rerendering, but we can optimize for that later
    }

    componentWillUnmount () { 
        this.props.client.off("Room", this.roomListener) 
        this.props.client.off("Room.name", this.roomListener) 
        this.props.client.off("RoomState.events", this.roomListener)
    }

    render(props,state) {
        //TODO: We're going to want to have different subcategories of rooms,
        //for actual pdfs, and for annotation discussions
        const rooms = state.rooms.filter(room => room.name.toLowerCase().includes(props.searchFilter.toLowerCase()))
                                 .sort((a,b) => { 
                                        const ts1 = a.getLastActiveTimestamp() 
                                        const ts2 = b.getLastActiveTimestamp()
                                        if (ts1 < ts2) return 1
                                        else if (ts2 < ts1) return -1
                                        else return 0
                                  }).map(room => { return <RoomListing key={room.roomId} queryParams={props.queryParams} loadPDF={props.loadPDF} client={props.client} room={room}/> })
        return (
            <Fragment>
                <div>{rooms}</div>
            </Fragment>
        )
    }
}

class Logout extends Component {
    render (props,state) {
        return (
            <footer>
                <a href='#' onclick={props.logoutHandler}>logout</a>
            </footer>
        )
    }
}

class RoomListing extends Component {
    render (props, state) {
        var pdfEvent = props.room.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS).getStateEvents(pdfStateType,"")
        var annotations = props.room.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS).getStateEvents(eventVersion)
        if (pdfEvent) return (<PDFRoomEntry  queryParams={props.queryParams} annotations={annotations} loadPDF={props.loadPDF} client={props.client} room={props.room} pdfevent={pdfEvent}/>)
    }
}

class PDFRoomEntry extends Component {

    constructor(props) {
        super(props)
        this.state = { 
            buttonsVisible : false,
            detailsOpen : false,
        }
    }

    handleLoad = _ => this.props.loadPDF(this.props.room.name)

    toggleButtons = _ => this.setState({ buttonsVisible : !this.state.buttonsVisible })

    handleClose = _ => this.props.client.leave(this.props.room.roomId)

    handleDetailsToggle = _ => this.setState({ detailsOpen : !this.state.detailsOpen })

    render (props, state) {
        const date = new Date(props.room.getLastActiveTimestamp())
        const members = props.room.getJoinedMembers()
        const memberIds = members.map(member => member.userId)
        const memberPills = members.map(member => <MemberPill member={member}/>)
        const clientId = props.client.getUserId()
        var status = "invited"
        const annotations = props.annotations.map(ev => ev.getContent())
                                             .filter(content => content.activityStatus == "open")
                                             .map(content => <AnnotationRoomEntry key={content.uuid} queryParams={props.queryParams} handleLoad={this.handleLoad} {... content}/>)
        if (memberIds.includes(clientId)) { status = "joined" }
        return (
            <div  data-room-status={status} class="roomListingEntry" id={props.room.roomId}>
                <div><a onclick={this.handleLoad}>{props.room.name}</a></div>
                <div>Members: {memberPills} </div>
                <div>Last Active: {date.toLocaleString('en-US',{
                    weekday : "short",
                    day : "numeric",
                    month : "short",
                    hour : "numeric",
                    minute : "numeric",
                    second : "numeric",
                })}</div> 
                {annotations.length > 0 
                    ?  <div><details>
                        <summary open={state.detailsOpen} ontoggle={this.handleDetailsToggle}>{annotations.length} annotations</summary>
                        <table class="annotationRoomTable">
                            <thead> <tr><td>UUID</td><td>Page</td></tr></thead>
                            <tbody>{annotations}</tbody>
                        </table>
                    </details>
                    </div>
                    : null
                }
                <div data-room-entry-buttons-visible={state.buttonsVisible} class="roomListingEntryButtons">
                    { state.buttonsVisible ? null : <button title="Toggle buttons" onclick={this.toggleButtons}>{Icons.moreVertical}</button> }
                    { state.buttonsVisible ? <button title="Toggle buttons" onclick={this.toggleButtons}>{Icons.close}</button> : null }
                    { state.buttonsVisible ? <button title="Leave conversation" onclick={this.handleClose}>{Icons.userMinus}</button> : null }
                </div>
            </div>
        )
    }
}

class MemberPill extends Component {
    render (props, state) {
        const colorFromId = new UserColor(props.member.userId)
        return (<Fragment>
                <span style={{background:colorFromId.light}} class="memberPill">{props.member.name}</span>
                    <wbr></wbr> 
                </Fragment>
        )
    }
}

class AnnotationRoomEntry extends Component {

    handleClick = () => {
        this.props.queryParams.set("focus", this.props.uuid)
        this.props.queryParams.set("page", this.props.pageNumber)
        this.props.handleLoad()
    }

    render (props, state) { 
        return <tr class="annotationRoomEntry">
                <td><a onclick={this.handleClick}>{props.uuid}</a></td>
                <td>{props.pageNumber}</td>
            </tr>
    }
}

class PdfUpload extends Component {

    mainForm = createRef()

    fileLoader = createRef()
     
    roomNameInput = createRef()

    roomTopicInput = createRef()

    submitButton = createRef()

    progressHandler = (progress) => this.setState({progress : progress})

    uploadFile = async (e) => { 
        e.preventDefault()
        const theFile = this.fileLoader.current.files[0]
        const theName = this.roomNameInput.current.value
        const theTopic = this.roomTopicInput.current.value
        if (theFile.type == "application/pdf") {
            this.submitButton.current.setAttribute("disabled", true)
            const id = await this.props.client.createRoom({
                room_alias_name : theName,
                visibility : "public",
                name : theName,
                topic : theTopic,
                //We declare the room a space
                creation_content: {
                    "org.matrix.msc1772.type" : "org.matrix.msc1772.space"
                },
                //we allow anyone to join, by default, for now
                initial_state : [{
                    type : "m.room.join_rules",
                    state_key : "",
                    content : {"join_rule": "public"}
                }],
                power_level_content_override : {
                    events : {
                        [eventVersion] : 0 //we allow anyone to annotate, by default, for now
                    }
                }
            })
            this.props.client.uploadContent(theFile, { progressHandler : this.progressHandler }).then(e => {
                let parts = e.split('/')
                this.props.client.sendStateEvent(id.room_id, pdfStateType, {
                    "identifier": parts[parts.length - 1] 
                })
                //XXX: this event doesn't get through before the name is
                //assigned, so the room isn't detected as a pdf room. Probably
                //need to include the pdf in the room's creation event to make
                //this work right.
            }).then(_ => {
                this.mainForm.current.reset()
                this.props.showMainView()
            })
        }
    } 

    render (props, state) {
        return (
            <form id="pdfUploadForm" ref={this.mainForm} onsubmit={this.uploadFile}>
                <label> Pdf to discuss</label>
                <input ref={this.fileLoader} type="file"/>
                <label>Name for Discussion</label>
                <input ref={this.roomNameInput} type="text"/>
                <label>Topic of Discussion</label>
                <textarea ref={this.roomTopicInput} type="text"/>
                <div id="pdfUploadFormSubmit">
                    <input ref={this.submitButton} value="Create Discussion" type="submit"/>
                </div>
                {this.state.progress 
                    ?  <div id="pdfUploadFormProgress">
                          <span>{this.state.progress.loaded} bytes</span>
                          <span> out of </span>
                          <span>{this.state.progress.total} bytes</span>
                       </div>
                    : null
                }
            </form>
        )
    }
}

class ProfileInfomation extends Component {

    constructor(props) {
        super(props)
        const me = props.client.getUser(props.client.getUserId())
        this.state = {
            previewUrl : Matrix.getHttpUriForMxc(serverRoot, me.avatarUrl, 180, 180, "crop"),
            displayName : me.displayName,
        }
    }

    displayNameInput = createRef()

    avatarImageInput = createRef()

    submitButton = createRef()

    mainForm = createRef()

    progressHandler = (progress) => this.setState({progress : progress})

    uploadAvatar = _ => this.avatarImageInput.current.click()

    removeAvatar = _ => this.setState({ previewUrl : null })

    updatePreview = _ => {
        const theImage = this.avatarImageInput.current.files[0]
        if (theImage && /^image/.test(theImage.type)) {
            this.setState({previewUrl : URL.createObjectURL(this.avatarImageInput.current.files[0]) })
        }
    }

    updateProfile = async (e) => { 
        e.preventDefault()
        const theImage = this.avatarImageInput.current.files[0]
        const theDisplayName = this.displayNameInput.current.value
        this.submitButton.current.setAttribute("disabled", true)
        if (theDisplayName) await this.props.client.setDisplayName(theDisplayName)
        if (theImage && /^image/.test(theImage.type)) {
            await this.props.client.uploadContent(theImage, { progressHandler : this.progressHandler })
                      .then(e => this.props.client.setAvatarUrl(e))
        } else if (!this.state.previewUrl) {
            await this.props.client.setProfileInfo("avatar_url", {avatar_url : "null"})
            //XXX this is a pretty awful hack. Discussion at https://github.com/matrix-org/matrix-doc/issues/1674
        }
        this.mainForm.current.reset()
        this.props.showMainView()
    } 

    render (props, state) {
        return (
            <form id="profileInformationForm" ref={this.mainForm} onsubmit={this.updateProfile}>
                <label>My Display Name</label>
                <input placeholder={state.displayName} ref={this.displayNameInput} type="text"/>
                <div id="profileInformationAvatarControls">
                    <label>My Avatar
                    </label>
                    {state.previewUrl ? <input onclick={this.removeAvatar} value="Remove Avatar" type="button"/> : null}
                </div>
                {state.previewUrl 
                    ? <img onclick={this.uploadAvatar} id="profileSelector" src={state.previewUrl}/> 
                    : <div onclick={this.uploadAvatar} id="profileSelector"/>}
                <input id="profileInformationFormHidden" onchange={this.updatePreview} ref={this.avatarImageInput} type="file"/>
                <div id="profileInformationFormSubmit">
                    <input ref={this.submitButton} value="Update Profile" type="submit"/>
                </div>
                {this.state.progress 
                    ?  <div id="profileInformationFormProgress">
                          <span>{this.state.progress.loaded} bytes</span>
                          <span> out of </span>
                          <span>{this.state.progress.total} bytes</span>
                       </div>
                    : null
                }
            </form>
        )
    }
}
