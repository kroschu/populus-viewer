import { h, createRef, Fragment, Component } from 'preact';
import sanitizeHtml from 'sanitize-html'
import { renderLatexInElement } from './latex.js'
import { UserColor } from './utils/colors.js'
import { sanitizeHtmlParams } from './constants.js'
import { processLinks } from './links.js'
import { toClockTime } from './utils/temporal.js'
import UserInfoHeader from './userInfoHeader.js'
import MessageFrame from './messageFrame.js'
import MediaModal from './mediaModal.js'
import 'emoji-picker-element'
import BlurhashCanvas from './blurhashCanvas.js'
import Location from './utils/location.js'
import Client from './client.js'
import * as Replies from './utils/replies.js'
import * as Icons from './icons.js'
import './styles/message.css'

export class TextMessage extends Component {
  componentDidMount() {
    renderLatexInElement(this.messageBody.current)
    processLinks(this.messageBody.current)
  }

  componentDidUpdate(prevProps) {
    if (this.props.reactions[this.props.event.getId()] !== prevProps.reactions[prevProps.event.getId()]) {
      renderLatexInElement(this.messageBody.current)
      processLinks(this.messageBody.current)
    }
  }

  messageBody = createRef()

  render(props) {
    const content = this.props.event.getContent()
    const isReply = Replies.isReply(content)
    return <MessageFrame
      canEdit={true}
      displayOnly={props.displayOnly}
      reactions={props.reactions}
      canRedact={props.canRedact}
      event={props.event}>
      <div ref={this.messageBody} class="message-body">
        {isReply ? <ReplyPreview reactions={props.reactions} event={props.event} /> : null}
        <DisplayContent content={content} />
      </div>
    </MessageFrame>
  }
}

export class EmoteMessage extends Component {
  componentDidMount() {
    renderLatexInElement(this.messageBody.current)
    processLinks(this.messageBody.current)
  }

  componentDidUpdate(prevProps) {
    if (this.props.reactions[this.props.event.getId()] !== prevProps.reactions[prevProps.event.getId()]) {
      renderLatexInElement(this.messageBody.current)
      processLinks(this.messageBody.current)
    }
  }

  messageBody = createRef()

  sender = Client.client.getUser(this.props.event.getSender())

  userColor = new UserColor(this.props.event.getSender())

  render(props) {
    const content = props.event.getContent()
    return <MessageFrame
      displayOnly={props.displayOnly}
      reactions={props.reactions}
      event={props.event}>
      <div ref={this.messageBody} class="message-body">
        <div class="emote-banner" style={this.userColor.styleVariables}>
          {this.sender.displayName}:
        </div>
        <DisplayContent content={content} />
      </div>
    </MessageFrame>
  }
}

export class AnnotationMessage extends Component {
  handleClick = _ => {
    if (this.hasFocus()) this.props.setSecondaryFocus(null)
  }

  handleLinkClick = e => {
    e.stopPropagation()
    if (!this.hasFocus()) this.props.setSecondaryFocus(this.location)
  }

  sender = Client.client.getUser(this.props.event.getSender())

  userColor = new UserColor(this.props.event.getSender())

  location = new Location(this.props.event)

  hasFocus = _ => this.location === this.props.secondaryFocus

  render(props) {
    if (!this.location.getType()) return
    return <MessageFrame
      styleOverride={this.hasFocus() ? {background: this.userColor.ultralight, ... this.userColor.styleVariables} : null }
      reactions={props.reactions}
      event={props.event}
      getCurrentEdit={this.getCurrentEdit}>
      { this.location.getText() 
        ? <div onClick={this.handleClick} class="message-body">
          <span class="text-annotation-banner">
            On&nbsp;
            <a onClick={this.handleLinkClick}
              href={`${window.location.origin}${window.location.pathname}#/${encodeURIComponent(props.resourceAlias)}/${this.location.getPageIndex()}/`} >
              page {this.location.getPageIndex()}
            </a>:
          </span>
          <blockquote>
            {this.location.getText()}
          </blockquote>
        </div>
        : <div onClick={this.handleClick} class="message-body">
          <p>
            <span class="audio-annotation-banner">
              {Icons.headphones} <span>From </span>
              <a onClick={this.handleLinkClick}
                href={`${window.location.origin}${window.location.pathname}#/${encodeURIComponent(props.resourceAlias)}/${Math.floor(this.location.getIntervalStart() / 1000)}`} >
                {toClockTime(this.location.getIntervalStart() / 1000)} to {toClockTime(this.location.getIntervalEnd() / 1000)}
              </a>
            </span>
          </p>
        </div>
      }
    </MessageFrame>
  }
}

class ReplyPreview extends Component {
  // eventually will want a mechanism for refreshing on receipt of edits
  componentDidMount() {
    this.getLiveEvent()
    renderLatexInElement(this.replyPreview.current)
    processLinks(this.replyPreview.current)
  }

  componentDidUpdate() {
    this.getLiveEvent()
    renderLatexInElement(this.replyPreview.current)
    processLinks(this.replyPreview.current)
  }

  async getLiveEvent() {
    if (!this.state.liveEvent) {
      const inReplyToId = this.props.event.getContent()["m.relates_to"]["m.in_reply_to"].event_id
      const roomId = this.props.event.getRoomId()
      const theRoom = Client.client.getRoom(roomId)
      if (!theRoom) return // room state not ready
      const inReplyTo = theRoom.findEventById(inReplyToId)
      if (inReplyTo) this.setState({ liveEvent: inReplyTo })
      try {
        console.log("trying to retrive live event")
        await Client.client.getEventTimeline(theRoom.getUnfilteredTimelineSet(), inReplyToId)
        console.log("retrived")
        this.setState({ liveEvent: theRoom.findEventById(inReplyToId) })
      } catch (e) {
        // the above uses the event-context route, which isn't implemented yet in Dendrite:
        //
        // https://github.com/matrix-org/dendrite/issues/670
        //
        // Hence, 404s right now.
        console.log("couldn't retrieve - is this a dendrite server? see https://github.com/matrix-org/dendrite/issues/670")
        console.log(e)
      }
    }
  }

  replyPreview = createRef()

  handleLoad = _ => this.setState({ loaded: true })

  fromLiveEvent = _ => {
    const content = this.state.liveEvent?.getContent()
    if (!content) return
    const hasHtml = (content.format === "org.matrix.custom.html") && content.formatted_body
    const isReply = Replies.isReply(content)
    const senderColors = new UserColor(this.state.liveEvent.getSender())
    let displayBody
    if (!this.state.liveEvent.getContent().msgtype) {
      displayBody = <div class="redacted-preview">Original Message Deleted</div>
    } else {
      switch (this.state.liveEvent.getContent().msgtype) {
        case "m.video": {
          const info = this.state.liveEvent.getContent()?.info.thumbnail_info || props.event?.getContent()?.info
          const blurhash = this.state.liveEvent.getContent()?.info?.blurhash
          const thumbUrl = this.state.liveEvent.getContent().info.thumbnail_url
          const poster = thumbUrl ? Client.client.getHttpUriForMxcFromHS(thumbUrl) : null
          displayBody = <Fragment>
            <video class="media-message-thumbnail"
              controls
              poster={poster}
              onloadedmetadata={this.handleLoad}
              preload="metadata"
              src={Client.client.getHttpUriForMxcFromHS(this.state.liveEvent.getContent().url)} />
            <BlurhashCanvas height={info.h} width={info.w} blurhash={blurhash} class="media-message-blurhash"/>
          </Fragment>
          break;
        }
        case "m.image": {
          const info = this.state.liveEvent.getContent()?.info.thumbnail_info || props.event?.getContent()?.info
          const blurhash = this.state.liveEvent.getContent()?.info?.blurhash
          const thumbUrl = this.state.liveEvent.getContent().info.thumbnail_url
          const url = thumbUrl ? Client.client.getHttpUriForMxcFromHS(thumbUrl) : null
          displayBody = <Fragment>
            <img 
              onLoad={this.handleLoad}
              loading="lazy"
              class="media-message-thumbnail"
              src={url}
            />
            <BlurhashCanvas height={info.h} width={info.w} blurhash={blurhash} class="media-message-blurhash"/>
          </Fragment>
          break;
        }
        case "m.audio": {
          displayBody = <audio
            controls
            src={Client.client.getHttpUriForMxcFromHS(this.state.liveEvent.getContent().url)} />
          break;
        }
        case "m.file": {
          displayBody = <div class="file-upload">
            file upload:&nbsp;
            <a href={Client.client.getHttpUriForMxcFromHS(this.state.liveEvent.getContent().url)}>
              {this.state.liveEvent.getContent().filename}
            </a>
          </div>
          break;
        }
        case "m.text": {
          if (isReply && hasHtml) {
            const displayText = sanitizeHtml(content.formatted_body, Replies.stripReply)
            displayBody = <div dangerouslySetInnerHTML={{__html: displayText}} />
          } else if (hasHtml) {
            displayBody = <div dangerouslySetInnerHTML={{__html: content.formatted_body}} />
          } else if (isReply) {
            displayBody = <div>Replies.stripFallbackPlainString(content.body)</div>
          } else {
            displayBody = <div>content.body</div>
          }
          break;
        }
        case "m.notice": {
          if (isReply && hasHtml) {
            const displayText = sanitizeHtml(content.formatted_body, Replies.stripReply)
            displayBody = <div dangerouslySetInnerHTML={{__html: displayText}} />
          } else if (hasHtml) {
            displayBody = <div dangerouslySetInnerHTML={{__html: content.formatted_body}} />
          } else if (isReply) {
            displayBody = <div>Replies.stripFallbackPlainString(content.body)</div>
          } else {
            displayBody = <div>content.body</div>
          }
        }
      }
    }
    return <Fragment>
      <div class="reply-preface">In reply to:</div>
      <UserInfoHeader isReply userId={this.state.liveEvent.getSender()} />
      <div ref={this.replyPreview} data-media-message-loaded={this.state.loaded} style={senderColors.styleVariables} class="reply-preview">
        {displayBody}
      </div>
    </Fragment>
  }

  fallbackPreview = _ => {
    const content = this.props.event.getContent()
    const hasHtml = (content.format === "org.matrix.custom.html") && content.formatted_body
    const style = {'--user_light': 'lightgray'}
    return hasHtml
      ? <div style={style} class="reply-preview reply-fallback" dangerouslySetInnerHTML={{__html: Replies.getFallbackHtml(content)}} />
      : <div style={style} class="reply-preview reply-fallback">{Replies.getFallbackPlain(content)}</div>
  }

  render(_props, state) {
    if (state.liveEvent) return this.fromLiveEvent()
    return this.fallbackPreview()
  }
}

export class NoticeMessage extends Component {
  componentDidMount() {
    renderLatexInElement(this.messageBody.current)
  }

  componentDidUpdate(prevProps) {
    if (this.props.reactions[this.props.event.getId()] !== prevProps.reactions[prevProps.event.getId()]) {
      renderLatexInElement(this.messageBody.current)
    }
  }

  messageBody = createRef()

  noticeStyle = {
    "--user_ultralight": "hsl(0,0%, 95%)",
    "--user_light": "hsl(0,0%, 80%)",
    "--user_solid": "hsl(0,0%, 50%)",
    "--user_dark": "hsl(0,0%, 20%)"
  }

  render(props) {
    const content = props.event.getContent()
    const isReply = Replies.isReply(content)
    return <MessageFrame
      displayOnly={props.displayOnly}
      reactions={props.reactions}
      canRedact={props.canRedact}
      styleOverride={this.noticeStyle}
      event={props.event}>
      <div ref={this.messageBody} class="message-body">
        {isReply ? <ReplyPreview reactions={props.reactions} event={props.event} /> : null}
        <DisplayContent content={content} />
      </div>
    </MessageFrame>
  }
}

export function DisplayContent(props) {
  const content = props.content
  const isReply = Replies.isReply(content)
  const isEmoji = /^\s*(\p{Extended_Pictographic}\p{Emoji_Component}*){1,3}\s*$/u.test(content.body)
  if ((!isEmoji && content.format === "org.matrix.custom.html") && content.formatted_body) {
    return <div
      dangerouslySetInnerHTML={{__html: sanitizeHtml(isReply
        ? sanitizeHtml(content.formatted_body, Replies.stripReply)
        : content.formatted_body, sanitizeHtmlParams)
      }} />
  } else {
    return <div class={isEmoji ? "large-emoji-display" : null}>
      {isReply
        ? Replies.stripFallbackPlain(content.body)
        : content.body}
    </div>
  }
}

export class FileMessage extends Component {
  userColor = new UserColor(this.props.event.getSender())

  isMe = this.props.event.getSender() === Client.client.getUserId()

  url = Client.client.getHttpUriForMxcFromHS(this.props.event.getContent().url)

  render(props) {
    const filename = props.event.getContent().filename
    return <MessageFrame
      displayOnly={props.displayOnly}
      reactions={props.reactions}
      canRedact={props.canRedact}
      event={props.event} >
        <div class="message-body file-upload">
          file upload:&nbsp;
          <a href={this.url} download={filename}>{filename}</a>
        </div>
    </MessageFrame>
  }
}

export class ImageMessage extends Component {

  userColor = new UserColor(this.props.event.getSender())

  isMe = this.props.event.getSender() === Client.client.getUserId()

  url = this.props.event.getContent().info.thumbnail_url
    ? Client.client.getHttpUriForMxcFromHS(this.props.event.getContent().info.thumbnail_url)
    : Client.client.getHttpUriForMxcFromHS(this.props.event.getContent().url)

  showPreview = _ => {
    MediaModal.set(<img
      src={Client.client.getHttpUriForMxcFromHS(this.props.event.getContent().url)}
    />)
  }

  handleLoad = _ => this.setState({ loaded: true })

  // TODO need some sort of modal popup providing a preview of the full video
  render(props, state) {
    const info = props.event.getContent()?.info.thumbnail_info || props.event?.getContent()?.info
    const blurhash = props.event?.getContent()?.info?.blurhash
    return <MessageFrame
      displayOnly={props.displayOnly}
      reactions={props.reactions}
      canRedact={props.canRedact}
      event={props.event}>
        <div class="message-body media-message" data-media-message-loaded={state.loaded}>
          <img 
            onclick={this.showPreview}
            onLoad={this.handleLoad}
            loading="lazy"
            class="media-message-thumbnail"
            src={this.url} />
          <BlurhashCanvas height={info.h} width={info.w} blurhash={blurhash} class="media-message-blurhash"/>
        </div>
    </MessageFrame>
  }
}

export class VideoMessage extends Component {
  userColor = new UserColor(this.props.event.getSender())

  isMe = this.props.event.getSender() === Client.client.getUserId()

  content = this.props.event.getContent()

  poster = this.content.info.thumbnail_url
    ? Client.client.getHttpUriForMxcFromHS(this.content.info.thumbnail_url)
    : null

  handleLoad = _ => this.setState({ loaded: true })

  url = Client.client.getHttpUriForMxcFromHS(this.content.url)

  render(props, state) {
    const info = props.event.getContent()?.info.thumbnail_info || props.event?.getContent()?.info
    const blurhash = props.event?.getContent()?.info?.blurhash
    return <MessageFrame
      displayOnly={props.displayOnly}
      reactions={props.reactions}
      canRedact={props.canRedact}
      event={props.event}>
        <div class="message-body media-message" data-media-message-loaded={state.loaded}>
          <video class="media-message-thumbnail"
            controls
            poster={this.poster}
            onloadedmetadata={this.handleLoad}
            preload="metadata"
            src={this.url} />
          <BlurhashCanvas height={info.h} width={info.w} blurhash={blurhash} class="media-message-blurhash"/>
        </div>
    </MessageFrame>
  }
}

export class AudioMessage extends Component {
  userColor = new UserColor(this.props.event.getSender())

  isMe = this.props.event.getSender() === Client.client.getUserId()

  content = this.props.event.getContent()

  url= Client.client.getHttpUriForMxcFromHS(this.content.url)

  render(props) {
    return <MessageFrame
      displayOnly={props.displayOnly}
      reactions={props.reactions}
      canRedact={props.canRedact}
      event={props.event}>
        <div class="message-body media-message">
          <audio controls src={this.url} />
        </div>
    </MessageFrame>
  }
}
