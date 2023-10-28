import React, { Component } from "react";
import Split from "react-split";
import Cookies from "js-cookie";

import {
  PdfLoader,
  PdfHighlighter,
  Tip,
  Highlight,
  Popup,
} from "react-pdf-highlighter";

import Xarrow from "react-xarrows";
import { Spinner } from "../Spinner/Spinner";
import FileUpload from "../FileUpload/FileUpload";
import { fabric } from "fabric";
import ContextMenu from "../ContextMenu";
import CommentPopup from "../CommentPopup";
import * as mainHandler from "../../services/main";
import AreaHighlight from "../AreaHighlight";
import SearchPopup from "../SearchPopup";

import "./HighlightDemo.css";
import DomPointer from "../DomPointer";
import NoteFormatToolbar from "../NoteFormatToolbar";
import MainToolbar from "../MainToolbar";
import WorkspaceToolbar from "../WorkspaceToolbar";

const HighlightPopup = ({ comment }) =>
  comment ? (
    comment.text ? (
      <div className="Highlight__popup">
        {comment.emoji} {comment.text}
      </div>
    ) : null
  ) : null;

// set up object styles
fabric.Object.prototype.cornerColor = "#e2e8f0";
fabric.Object.prototype.cornerStyle = "circle";

fabric.Textbox.prototype.set({
  _getNonTransformedDimensions() {
    // Object dimensions
    return new fabric.Point(this.width, this.height).scalarAdd(this.padding);
  },
  _calculateCurrentDimensions() {
    // Controls dimensions
    return fabric.util.transformPoint(
      this._getTransformedDimensions(),
      this.getViewportTransform(),
      true
    );
  },
});

let currentMode = "";
const modes = {
  drawing: "drawing",
  pan: "pan",
};

let canvasHistory = {
  state: [],
  currentIndex: -1,
  undoFinishedStatus: true,
  redoFinishedStatus: true,
  undoStatus: false,
  redoStatus: false,
  counter: 0,
  brushCounter: 0,
};

// ! exports services as GLOBAL variables here so other methods have access to them
let highlightServices;
const noteSearchService = mainHandler.noteSearchService;
const panToNoteService = mainHandler.panToNoteService;
let linePointerServices; // * later being set up in componentDidMount to have access to the states
let canvasNoteServices;
let noteFormatServices;
let undoRedoServices;
let contextMenuServices;

class HighlightDemo extends Component {
  state = {
    url: null,
    highlights: this.props.fileUrl,
    comments: [],
    doodles: [],
    activeNoteCoord: {},
    textInput: "",
    topAmount: 70,
    showContextMenu: false,
    targetPointer: {},
    absolutePointer: {},
    isQuoteNote: false,
    isCommentNote: false,
    isDoodle: false,
    isCanvas: false,
    canvasBuffer: null,
    isObjMoving: false,
    canvas: {},
    isFileUploaded: false,
    connectionView: false,
    allConnections: false,
    quoteNoteClickEvent: {},
    selectedBrushColor: "rgba(57, 65, 80, 1)",
    selectedPanColor: "rgba(57, 65, 80, 1)",
    colorPickerColor: "rgba(57, 65, 80, 1)",
    colorPicker: false,
    commentLocation: {},
    quoteLocation: {},
    commentConnected: null,
    arrowTest: null,
    domPointerPool: {},
    renderPdfToQuoteArrow: null,
    connections: [],
    deleteLink: false,
    pdfHighlighterRef: React.createRef(),
    currentLinkedNoteToPdf: {},
    currentLinkedHighlight: {},
    savedState: null,
    showNoteToolbar: false,
    isListMode: false,
    isMobile: false,
    showSearch: false,
    searchResults: {
      searchTerm: "",
      highlights: [],
      comments: [],
    },
  };

  handleChangeComplete = (color) => {
    let rgb = `rgba(${color.rgb.r},${color.rgb.g},${color.rgb.b},${color.rgb.a})`;
    this.setState({ colorPickerColor: rgb });
    this.state.canvas.freeDrawingBrush.color = this.state.colorPickerColor;
  };

  selectedIconFunc = () => {
    if (currentMode === "") {
      this.setState({ selectedPanColor: "rgba(57, 65, 80, 1)" });
      this.setState({ selectedBrushColor: "rgba(57, 65, 80, 1)" });
    }
    if (currentMode === modes.pan) {
      if (this.state.selectedPanColor == "rgba(57, 65, 80, 1)") {
        this.setState({ selectedPanColor: "rgba(20, 184, 166, 1)" });
      } else {
        this.setState({ selectedPanColor: "rgba(57, 65, 80, 1)" });
      }
      this.setState({ selectedBrushColor: "rgba(57, 65, 80, 1)" });
    }
    if (currentMode === modes.drawing) {
      if (this.state.selectedBrushColor == "rgba(57, 65, 80, 1)") {
        this.setState({ selectedBrushColor: "rgba(20, 184, 166, 1)" });
      } else {
        this.setState({ selectedBrushColor: "rgba(57, 65, 80, 1)" });
      }
      this.setState({ selectedPanColor: "rgba(57, 65, 80, 1)" });
    }
  };

  toggleColorPicker = () => {
    if (this.state.colorPicker === false) {
      this.setState({ colorPicker: true });
    } else {
      this.setState({ colorPicker: false });
    }
  };

  resetHighlights = () => {
    this.setState({
      highlights: [],
    });
  };

  toggleDocument = () => {
    const newUrl =
      this.state.url === PRIMARY_PDF_URL ? SECONDARY_PDF_URL : PRIMARY_PDF_URL;

    this.setState({
      url: newUrl,
      highlights: testHighlights[newUrl] ? [...testHighlights[newUrl]] : [],
    });
  };

  async addHighlight(highlight) {
    const { content, position } = highlight;

    const newNote = {
      canvas: {
        borderColor: "#6DF0DA",
        borderRadius: 5,
        borderScaleFactor: 6,
        cornerColor: "transparent",
        cornerSize: 9,
        // editable: false,
        left: 65,
        lockScalingY: true,
        top: this.state.topAmount,
        transparentCorners: true,
      },
      highlighter: {
        position: position,
        content: content,
      },
      noteType: "QuoteNote",
      pdfId: this.props.pdfId,
      connections: [],
    };

    if (content.text) {
      newNote.canvas = {
        ...newNote.canvas,
        width: 300,
        padding: 30,
        backgroundColor: "#394150",
        fill: "white",
        fontSize: 14,
        fontFamily: "sans-serif",
        lineHeight: 1.5,
        textAlign: "left",
      };
    }

    if (content.image) {
      newNote.canvas = {
        ...newNote.canvas,
        lockScalingX: true,
        stroke: "gray",
        strokeWidth: 1,
      };
    }

    // const canvasNote = await this.addNoteToCanvas(newNote);
    const canvasNote = await canvasNoteServices.addNoteToCanvas(
      noteFormatServices,
      newNote,
      this.renderContextMenu,
      this.props.pdfId
    );

    const canvasNoteBoudingBox = canvasNote.getBoundingRect();

    var dx =
      canvasNoteBoudingBox.left +
      canvasNoteBoudingBox.width -
      this.state.canvas.width / 2;
    var dy =
      canvasNoteBoudingBox.top +
      canvasNoteBoudingBox.height -
      this.state.canvas.height / 2;

    this.state.canvas.setActiveObject(canvasNote);
    this.state.canvas.relativePan(new fabric.Point(-dx, -dy));

    const { highlights } = this.state;
    this.setState({
      highlights: [...highlights, canvasNote],
      topAmount: this.state.topAmount + 100,
    });
  }

  // This function is for OpenAI calls from PDF view
  async addOpenAiNote(highlight, type) {
    const { content, position } = highlight;
    if (type === "Summarize") {
      content.text = await mainHandler.chatServices.callSummarize(content.text);
    } else if (type === "Bullet Point") {
      content.text = await mainHandler.chatServices.callBulletpoint(
        content.text
      );
    } else if (type === "Elaborate") {
      content.text = await mainHandler.chatServices.callElaborate(content.text);
    }

    const newNote = {
      canvas: {
        borderColor: "#6DF0DA",
        borderRadius: 5,
        borderScaleFactor: 6,
        cornerColor: "transparent",
        cornerSize: 9,
        // editable: false,
        left: 65,
        lockScalingY: true,
        top: this.state.topAmount,
        transparentCorners: true,
      },
      highlighter: {
        position: position,
        content: content,
      },
      noteType: "QuoteNote",
      pdfId: this.props.pdfId,
      connections: [],
    };

    if (content.text) {
      newNote.canvas = {
        ...newNote.canvas,
        width: 300,
        padding: 30,
        backgroundColor: "#394150",
        fill: "white",
        fontSize: 14,
        fontFamily: "sans-serif",
        lineHeight: 1.5,
        textAlign: "left",
      };
    }

    if (content.image) {
      newNote.canvas = {
        ...newNote.canvas,
        lockScalingX: true,
        stroke: "gray",
        strokeWidth: 1,
      };
    }

    const canvasNote = await canvasNoteServices.addNoteToCanvas(
      noteFormatServices,
      newNote,
      this.renderContextMenu,
      this.props.pdfId
    );

    const canvasNoteBoudingBox = canvasNote.getBoundingRect();

    var dx =
      canvasNoteBoudingBox.left +
      canvasNoteBoudingBox.width -
      this.state.canvas.width / 2;
    var dy =
      canvasNoteBoudingBox.top +
      canvasNoteBoudingBox.height -
      this.state.canvas.height / 2;

    this.state.canvas.setActiveObject(canvasNote);
    this.state.canvas.relativePan(new fabric.Point(-dx, -dy));

    const { highlights } = this.state;
    this.setState({
      highlights: [...highlights, canvasNote],
      topAmount: this.state.topAmount + 100,
    });
  }

  updateHighlight(highlightId, position, content) {
    this.setState({
      highlights: this.state.highlights.map((h) => {
        const {
          id,
          position: originalPosition,
          content: originalContent,
          ...rest
        } = h;
        return id === highlightId
          ? {
              id,
              position: { ...originalPosition, ...position },
              content: { ...originalContent, ...content },
              ...rest,
            }
          : h;
      }),
    });
  }

  updateNote = async (event) => {
    const updatedQuoteNote = {
      id: event.target.id,
      canvas: {
        top: event.target.top,
        left: event.target.left,
        width: event.target.width,
        height: event.target.height,
        angle: event.target.angle,
        flipX: event.target.flipX,
        flipY: event.target.flipY,
        scaleX: event.target.scaleX,
        scaleY: event.target.scaleY,
        skewX: event.target.skewX,
        skewY: event.target.skewY,
        backgroundColor: event.target.backgroundColor,
      },
      comment: event.target.text,
    };
    await mainHandler.canvasNoteDbServices.updateCanvasNote(updatedQuoteNote);

    const topAmount = this.updateTopAmount({
      highlights: this.state.highlights,
      comments: this.state.comments,
    });

    this.setState({ topAmount });
  };

  toggleMode = async (mode) => {
    if (mode === modes.drawing) {
      if (currentMode === modes.drawing) {
        this.selectedIconFunc();
        currentMode = "";
        if (this.state.colorPicker) this.setState({ colorPicker: false });
        this.state.canvas.isDrawingMode = false;
        this.state.canvas.renderAll;

        const groupObj = undoRedoServices.strokeGroup.toObject();
        if (groupObj.objects.length > 0) {
          const doodle = {
            canvas: groupObj,
            connections: [],
            noteType: "Doodle",
            pdfId: this.props.pdfId,
          };

          const canvasDoodle = await canvasNoteServices.addNoteToCanvas(
            noteFormatServices,
            doodle,
            this.renderContextMenu,
            this.props.pdfId
          );
          this.state.canvas.requestRenderAll();
        }
        this.state.canvas.remove(undoRedoServices.strokeGroup);
        undoRedoServices.strokeGroup = null;
      } else {
        currentMode = modes.drawing;
        fabric.Object.prototype.evented = true;
        // currentMode = modes.drawing;
        if (this.state.colorPicker) this.setState({ colorPicker: false });
        this.state.canvas.freeDrawingBrush.color = this.state.colorPickerColor;
        undoRedoServices.strokeGroup = new fabric.Group(
          undoRedoServices.objList
        );
        this.state.canvas.freeDrawingBrush.width = 5;
        this.selectedIconFunc();
        this.state.canvas.isDrawingMode = true;
        this.state.canvas.renderAll;
      }
    } else if (mode === modes.pan) {
      if (currentMode === modes.pan) {
        currentMode = "";
        fabric.Object.prototype.evented = true;
        this.selectedIconFunc();
        //turning off panning mode
      } else {
        currentMode = modes.pan;
        // this.resetNav();

        fabric.Object.prototype.evented = false;
        if (this.state.colorPicker) this.setState({ colorPicker: false });
        this.state.canvas.isDrawingMode = false;
        this.state.canvas.renderAll;
        this.selectedIconFunc();

        if (undoRedoServices.strokeGroup) {
          const groupObj = undoRedoServices.strokeGroup.toObject();
          if (groupObj.objects.length > 0) {
            const doodle = {
              canvas: groupObj,
              connections: [],
              noteType: "Doodle",
              pdfId: this.props.pdfId,
            };
            // const canvasDoodle = this.addNoteToCanvas(doodle);
            const canvasDoodle = await canvasNoteServices.addNoteToCanvas(
              noteFormatServices,
              doodle,
              this.renderContextMenu,
              this.props.pdfId
            );
            this.state.canvas.requestRenderAll();
          }
          this.state.canvas.remove(undoRedoServices.strokeGroup);
          undoRedoServices.strokeGroup = null;
        } else {
          return;
        }
      }
    }
  };

  fabricCanvas = () => {
    const fabricCanvas = new fabric.Canvas("canvas", {
      width: document.querySelector(".fabric-container").clientWidth + 50,
      backgroundColor: "white",
      fireRightClick: true,
      preserveObjectStacking: true,
      // stateful: true,
    })
      .on("object:modified", (event) => {
        undoRedoServices.updateHistory(canvasHistory, undoRedoServices.objList);
        this.updateNote(event);
      })
      .on("object:moving", (e) => {
        this.updateCanvasLineAndPointers();
        canvasNoteServices.resetConnections();
        // this.isObjMoving = true;
        this.setState({ isObjMoving: true });

        fabricCanvasServices.onObjectMoving(e);
      })
      .on("mouse:down", (opt) => {
        if (
          this.state.canvas.getZoom() > 0.5 &&
          this.state.canvas.getActiveObject() &&
          this.state.canvas.getActiveObject().noteType === "CommentNote" &&
          this.state.canvas.getActiveObject().isEditing
        ) {
          this.setState({
            showNoteToolbar: true,
            activeNoteCoord: opt.target.getBoundingRect(),
          });
        } else {
          this.setState({ showNoteToolbar: false });
        }

        fabricCanvasServices.onMouseDown(
          opt,
          this.state.currentLinkedNoteToPdf,
          this.resetPdfToQuoteArrow,
          canvasNoteServices.resetConnections,
          // this.resetConnections,
          this.state.commentConnected,
          canvasHistory,
          currentMode,
          undoRedoServices.updateHistory
        );

        if (!this.state.canvas.getActiveObject() && this.state.allConnections) {
          canvasNoteServices.showAllConnections();
        }
      })
      .on("mouse:move", (opt) => {
        fabricCanvasServices.onMouseMove(opt);
      })
      .on("mouse:up", (opt) => {
        if (this.state.allConnections && this.state.isObjMoving) {
          this.setState({ isObjMoving: false });
          canvasNoteServices.showAllConnections();
        }

        if (opt.target === null) {
          this.renderContextMenu(opt, this.state.canvas);
        }

        fabricCanvasServices.onMouseUp(
          opt,
          undoRedoServices.updateHistory,
          undoRedoServices.strokeGroup,
          undoRedoServices.objList,
          canvasHistory,
          undoRedoServices.undoCanvas,
          currentMode
        );
      })
      .on("mouse:wheel", (opt) => {
        fabricCanvasServices.onMouseWheel(
          opt,
          this.updateCanvasLineAndPointers()
        );

        const activeObject = this.state.canvas.getActiveObject();
        if (activeObject) {
          activeObject.exitEditing();
          activeObject.enterEditing();
        }

        this.setState({ showNoteToolbar: false });
      })
      .on("object:added", (opt) => {
        opt.target.isLine ||
        opt.target.isIcon ||
        canvasHistory.undoStatus ||
        canvasHistory.redoStatus
          ? null
          : undoRedoServices.updateHistory(
              canvasHistory,
              undoRedoServices.objList
            );
      });

    fabricCanvas.upperCanvasEl.oncontextmenu = (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (fabricCanvas.getZoom() > 0.5) {
        fabricCanvas.hoverCursor = "context-menu";
      } else {
        fabricCanvas.hoverCursor = "auto";
      }
    };

    const fabricCanvasServices = mainHandler.fabricCanvasServices(
      fabricCanvas,
      HighlightDemo
    );

    return fabricCanvas;
  };

  updateCanvasLineAndPointers = () => {
    const allObjects = this.state.canvas.getObjects(); // get all objects in the canvas

    allObjects.map(async (object) => {
      // loop through these objects to find the one that the arrow is pointing to from the pdf

      if (
        object.pointerId === this.state.currentLinkedNoteToPdf.pointerId &&
        this.state.renderPdfToQuoteArrow
        // if the object is the same as the note that the arrow is pointing to and the arrow is already rendered
      ) {
        linePointerServices
          .updateCanvasLineAndPointers(object, this.state.domPointerPool)
          .then((notePointerRef) => {
            this.setState((prevState) => ({
              // update the positioning of the quote to pdf arrow
              renderPdfToQuoteArrow: {
                ...prevState.renderPdfToQuoteArrow,
                endRef: notePointerRef,
              },
            }));
          })
          .catch((err) => console.log(err));
      }
    });
  };

  resetPdfToQuoteArrow = (event) => {
    this.setState({
      renderPdfToQuoteArrow: null,
    });
  };

  resetNav = () => {
    canvasNoteServices.resetConnections();
    // currentMode = "";
    fabric.Object.prototype.evented = true;
    // this.state.canvas.isDrawingMode = false;
    // this.selectedIconFunc();
    this.setState({
      connectionView: false,
      allConnections: false,
    });
  };

  renderContextMenu = (event, canvas) => {
    event.e.preventDefault();
    event.e.stopPropagation();
    if (event.button === 3) {
      this.setState({ showContextMenu: true });
      this.setState({ targetPointer: event.pointer });
      this.setState({ absolutePointer: event.absolutePointer });

      if (event.target === null) {
        this.setState({ isCanvas: true });
        return;
      }

      if (event.target.noteType === "QuoteNote") {
        const quoteNoteFrom = { x: event.e.clientX, y: event.e.clientY };
        this.setState({ quoteNoteClickEvent: quoteNoteFrom });
        this.setState({
          isQuoteNote: true,
          isCommentNote: false,
          isDoodle: false,
        });
      } else if (event.target.noteType === "CommentNote") {
        this.setState({
          isCommentNote: true,
          isQuoteNote: false,
          isDoodle: false,
        });
      } else if (event.target.noteType === "Doodle") {
        this.setState({
          isDoodle: true,
          isCommentNote: false,
          isQuoteNote: false,
        });
      }
      var selectedNoteIndex = canvas.getObjects().indexOf(event.target);
      this.state.canvas.setActiveObject(canvas.item(selectedNoteIndex));
    }
  };

  closeContextMenu = () => {
    this.setState({
      showContextMenu: false,
      isQuoteNote: false,
      isCommentNote: false,
      isDoodle: false,
      isCanvas: false,
    });
  };

  handleDeleteNote = async () => {
    const { newHighlights, newComments } =
      await contextMenuServices.handleDeleteNote(
        this.state.highlights,
        this.state.comments
      );

    this.setState({
      highlights: newHighlights,
      comments: newComments,
    });
    const topAmount = this.updateTopAmount({
      highlights: newHighlights,
      comments: newComments,
    });
    this.setState({ topAmount });
    this.setState({ showNoteToolbar: false });
    this.closeContextMenu();
  };

  handleGoToHighlight = async () => {
    const pdfArrowData = await highlightServices.handleGoToHighlight(
      this.state.highlights,
      this.state.pdfHighlighterRef.current,
      this.state.domPointerPool,
      linePointerServices
    );

    const { highlight, highlightPointerRef, notePointerRef, activeNote } =
      pdfArrowData;

    this.setState(
      (prevState) => ({
        renderPdfToQuoteArrow: {
          ...prevState.renderPdfToQuoteArrow,
          startRef: highlightPointerRef,
          endRef: notePointerRef,
        },
        currentLinkedNoteToPdf: activeNote,
        currentLinkedHighlight: highlight,
      }),
      () => {
        setTimeout(() => {
          this.resetPdfToQuoteArrow();
        }, 2000);
      }
    );

    this.closeContextMenu();
  };

  handleCommentLink = () => {
    const activeNote = this.state.canvas.getActiveObject();
    const fromPoint = activeNote.getCenterPoint();
    // this.setState({ commentLocation: fromPoint });
    canvasNoteServices.setCommentLocation(fromPoint);
    // this.setState({ commentConnected: activeNote });
    canvasNoteServices.setCommentConnected(activeNote);
    this.closeContextMenu();
  };

  handleCopyNote = async () => {
    // using fabric's .clone() seems more quirky than what we already do
    // this.setState({ cutObject: await contextMenuServices.handleCutCopyNote(this.props.pdfId) }); // returns either the cloned doodle or the active note

    if (
      this.state.canvasBuffer &&
      this.state.canvasBuffer.operation === "cut"
    ) {
      await canvasNoteServices.addNoteToCanvas(
        noteFormatServices,
        this.state.canvasBuffer.note,
        this.renderContextMenu,
        this.props.pdfId
      );
    }

    const activeNote = this.state.canvas.getActiveObject();
    if (!activeNote || activeNote.noteType === "QuoteNote") return;
    const databaseNote =
      await mainHandler.canvasNoteDbServices.getCanvasNoteById(activeNote.id);
    this.setState({
      canvasBuffer: {
        operation: "copy",
        note: databaseNote,
      },
    });
    this.closeContextMenu();
  };

  handleCut = async () => {
    // const clonedData = await contextMenuServices.handleCutCopyNote(this.props.pdfId)
    // this.state.canvas.requestRenderAll();

    // this.setState({ cutObject: fabric.util.object.clone(clonedData) });

    // this.handleDeleteNote()

    //set a cutObject state and then when it gets pasted back into the canvas, it should be added

    if (
      this.state.canvasBuffer &&
      this.state.canvasBuffer.operation === "cut"
    ) {
      await canvasNoteServices.addNoteToCanvas(
        noteFormatServices,
        this.state.canvasBuffer.note,
        this.renderContextMenu,
        this.props.pdfId
      );
    }

    const activeNote = this.state.canvas.getActiveObject();
    this.state.canvas.remove(activeNote);
    const databaseNote =
      await mainHandler.canvasNoteDbServices.getCanvasNoteById(activeNote.id);
    this.setState({
      canvasBuffer: {
        operation: "cut",
        note: databaseNote,
      },
    });

    this.state.canvas.requestRenderAll();
    this.closeContextMenu();
  };

  handlePaste = async () => {
    // const pastedObj = await contextMenuServices.handlePaste(this.state.cutObject, this.props.pdfId, this.state.absolutePointer)

    // if (pastedObj.noteType === "CommentNote" || pastedObj.noteType === "QuoteNote") {
    //   const comment = await canvasNoteServices.addNoteToCanvas(noteFormatServices, pastedObj, this.renderContextMenu, this.props.pdfId);
    //   // const comment = await this.addNoteToCanvas(pastedObj);

    //   this.setState({
    //     comments: [...this.state.comments, comment],
    //     topAmount: this.state.topAmount + 100,
    //   });

    // } else if (pastedObj.noteType === "Doodle") {
    //   await canvasNoteServices.addNoteToCanvas(pastedObj, newComment, this.renderContextMenu, this.props.pdfId);
    //   // this.addNoteToCanvas(pastedObj);
    // }

    if (!this.state.canvasBuffer) {
      this.closeContextMenu();
      return;
    }

    const clonedNote = { ...this.state.canvasBuffer.note };

    if (this.state.canvasBuffer.operation === "cut") {
      const buffer = { ...this.state.canvasBuffer };
      clonedNote.id = clonedNote._id;
      clonedNote.canvas.left = this.state.absolutePointer.x;
      clonedNote.canvas.top = this.state.absolutePointer.y;

      if (clonedNote.noteType === "QuoteNote") {
        this.setState({
          canvasBuffer: null,
        });
      } else {
        buffer.operation = "copy";
        this.setState({ canvasBuffer: buffer });
      }

      const canvasNote = await canvasNoteServices.addNoteToCanvas(
        noteFormatServices,
        clonedNote,
        this.renderContextMenu,
        this.props.pdfId
      );

      switch (canvasNote.noteType) {
        case "QuoteNote":
          const newHighlights = this.state.highlights.filter(
            (highlight) => highlight.id !== canvasNote.id
          );
          this.setState({
            highlights: [...newHighlights, canvasNote],
          });
          break;

        case "CommentNote":
          const newComments = this.state.comments.filter(
            (comment) => comment.id !== canvasNote.id
          );
          this.setState({ comments: [...newComments, canvasNote] });
          break;

        case "Doodle":
          const newDoodles = this.state.doodles.filter(
            (doodle) => doodle.id !== canvasNote.id
          );
          this.setState({ doodles: [...newDoodles, canvasNote] });
          break;

        default:
          break;
      }

      mainHandler.canvasNoteDbServices.updateCanvasNote(clonedNote);
    } else {
      clonedNote._id = null;
      clonedNote.canvas.left = this.state.absolutePointer.x;
      clonedNote.canvas.top = this.state.absolutePointer.y;
      clonedNote.connections = [];
      const canvasNote = await canvasNoteServices.addNoteToCanvas(
        noteFormatServices,
        clonedNote,
        this.renderContextMenu,
        this.props.pdfId
      );
      switch (canvasNote.noteType) {
        case "QuoteNote":
          this.setState({ highlights: [...this.state.highlights, canvasNote] });
          break;

        case "CommentNote":
          this.setState({ comments: [...this.state.comments, canvasNote] });
          break;

        case "Doodle":
          this.setState({ doodles: [...this.state.doodles, canvasNote] });
          break;

        default:
          break;
      }
    }

    // this.setState({ cutObject: null });

    this.state.canvas.requestRenderAll();
    this.closeContextMenu();
  };

  // This function is for OpenAI calls from canvas
  handleOpenAi = async (serviceType) => {
    const selectedNote = this.state.canvas.getActiveObject();
    let openAiResponse = null;

    switch (serviceType) {
      case "Summarize":
        openAiResponse = await mainHandler.chatServices.callSummarize(
          selectedNote.text
        );
        break;
      case "Elaborate":
        openAiResponse = await mainHandler.chatServices.callElaborate(
          selectedNote.text
        );
        break;
      case "Bullet Point":
        openAiResponse = await mainHandler.chatServices.callBulletpoint(
          selectedNote.text
        );
        break;
      default:
        return;
    }

    const openAiNote = {
      noteType: "CommentNote",
      pdfId: selectedNote.pdfId,
      comment: openAiResponse,
      canvas: {
        left: selectedNote.left + selectedNote.width,
        top: selectedNote.top + 25,
        borderColor: "#D1D5DB",
        borderScaleFactor: 1,
        cornerColor: "#AEF4E4",
        cornerSize: 12,
        editable: true,
        fontFamily: "sans-serif",
        lockScalingY: true,
        transparentCorners: false,
        width: 200,
        padding: 30,
        backgroundColor: "#E5E7EB",
        fill: "black",
        fontSize: 14,
        lineHeight: 1.5,
        textAlign: "left",
      },
      connections: [selectedNote.id],
    };

    const comment = await canvasNoteServices.addNoteToCanvas(
      noteFormatServices,
      openAiNote,
      this.renderContextMenu,
      this.props.pdfId
    );

    this.setState({
      comments: [...this.state.comments, comment],
      topAmount: this.state.topAmount + 100,
    });
  };

  addComment = async () => {
    if (canvasHistory.counter === 0) {
      canvasHistory.counter++;
    }
    // var p = { x: this.state.canvas.width / 2, y: this.state.canvas.height };
    var p = { x: this.state.canvas.width / 3, y: this.state.canvas.height / 2 };

    var invertedMatrix = fabric.util.invertTransform(
      this.state.canvas.viewportTransform
    );
    var transformedP = fabric.util.transformPoint(p, invertedMatrix);

    let newComment;

    newComment = {
      noteType: "CommentNote",
      pdfId: this.props.pdfId,
      connections: [],
    };

    newComment.canvas = {
      backgroundColor: "#E5E7EB",
      borderColor: "#D1D5DB",
      borderScaleFactor: 1,
      cornerColor: "#AEF4E4",
      cornerSize: 12,
      fill: "black",
      fontFamily: "sans-serif",
      fontSize: 14,
      left: transformedP.x - 250,
      lineHeight: 1.5,
      lockScalingY: true,
      padding: 30,
      textAlign: "left",
      top: transformedP.y - 170,
      transparentCorners: false,
      width: 200,
    };
    newComment.comment = "Insert note here...";

    const comment = await canvasNoteServices.addNoteToCanvas(
      noteFormatServices,
      newComment,
      this.renderContextMenu,
      this.props.pdfId
    );
    // const comment = await this.addNoteToCanvas(newComment);

    this.setState({
      comments: [...this.state.comments, comment],
      topAmount: this.state.topAmount + 100,
    });
  };

  saveAllQuoteNotes = async () => {
    const quoteNotes = this.state.highlights.map((highlight) => {
      const note = {
        canvas: {
          top: highlight.top,
          left: highlight.left,
        },
        id: highlight.id,
      };
      return note;
    });
    await mainHandler.canvasNoteDbServices.updateAllCanvasNotes(quoteNotes);
  };

  updateTopAmount = ({ highlights, comments }) => {
    let topAmount =
      100 +
      [...highlights, ...comments].reduce((acc, curr) => {
        if (curr.top > acc) {
          return curr.top;
        }
        return acc;
      }, 0);

    return topAmount;
  };

  updateDomPointerPool = (updatedPool) => {
    this.setState({ domPointerPool: updatedPool });
  };

  handleConnectionView = (e) => {
    e.preventDefault();
    this.resetNav();
    this.setState({ connectionView: !this.state.connectionView });
    canvasNoteServices.toggleConnectionView();
    const activeObj = this.state.canvas.getActiveObject();
    if (activeObj && !this.state.connectionView == true) {
      canvasNoteServices.getConnections(activeObj);
      // this.getConnections(activeObj);
    } else {
      canvasNoteServices.resetConnections();
      // this.resetConnections();
    }
  };

  handleAllConnections = (e) => {
    e.preventDefault();
    this.resetNav();
    canvasNoteServices.setConnectionViewToFalse();
    this.setState({ allConnections: !this.state.allConnections });
    if (!this.state.allConnections == true) {
      // this.showAllConnections();
      canvasNoteServices.showAllConnections();
    } else {
      canvasNoteServices.resetConnections();
      // this.resetConnections();
    }
  };

  handleResize = () => {
    if (window.innerWidth > 768) {
      // if desktop
      this.setState({ isMobile: false });
      // this.window.removeEventListener("resize", handleResize);
      const gutter = document.querySelector(".gutter");
      gutter.classList.remove("gutter-vertical");
      gutter.classList.add("gutter-horizontal");

      const fabricContainer = document.querySelector(".fabric-container");
      fabricContainer.style.removeProperty("height");
    } else {
      // if mobile
      this.setState({ isMobile: true });
      // this.window.removeEventListener("resize", handleResize);
      const gutter = document.querySelector(".gutter");
      gutter.classList.remove("gutter-horizontal");
      gutter.classList.add("gutter-vertical");

      const fabricContainer = document.querySelector(".fabric-container");
      fabricContainer.style.removeProperty("width");
    }
  };

  handleSearch = (e) => {
    e.preventDefault();
    const results = noteSearchService(
      this.state.highlights,
      this.state.comments,
      e.target.value
    );
    this.setState({ searchResults: results });
  };

  handleSearchResultClick = (note) => {
    const daNote =
      this.state.highlights.find((highlight) => highlight.id === note.id) ||
      this.state.comments.find((comment) => comment.id === note.id);
    panToNoteService(daNote, this.state.canvas, this.state.isMobile);
    // const id = e.target.id;
    // const  = this.state.highlights.find((highlight) => highlight.id === note.id);
    // this.state.canvas.setActiveObject(note);
    // this.state.canvas.renderAll();
    //this.setState({ showSearch: false });
  };

  handleSearchClose = (e) => {
    e.preventDefault();
    this.setState({ showSearch: false });
  };

  async componentDidMount() {
    this.handleResize();
    window.addEventListener("resize", this.handleResize);

    document.addEventListener("keydown", (event) => {
      if (event.ctrlKey && event.shiftKey && event.key === "F") {
        this.setState({ showSearch: true });
      }
    });

    if (this.props.fileUrl) {
      this.setState({ url: this.props.fileUrl, isFileUploaded: true });
    } else {
      this.setState({ url: null, isFileUploaded: false });
    }

    const canvas = this.fabricCanvas();
    this.setState({ canvas }, () => {
      // * set up global services paramaters that are stored in state, particulary if the canvas state is needed
      linePointerServices = mainHandler.linePointerServices(
        this.state.canvas,
        this.updateDomPointerPool
      );
      contextMenuServices = mainHandler.contextMenuServices(this.state.canvas);
      canvasNoteServices = mainHandler.canvasNoteServices(this.state.canvas);
      highlightServices = mainHandler.highlightServices(this.state.canvas);
      noteFormatServices = mainHandler.noteFormatServices(canvas);
      undoRedoServices = mainHandler.undoRedoServices(this.state.canvas);
    });

    const notes = await mainHandler.canvasNoteDbServices.getCanvasNotes(
      this.props.pdfId
    );

    undoRedoServices.updateHistory(canvasHistory, undoRedoServices.objList);

    window.addEventListener(
      "hashchange",
      highlightServices.scrollToHighlightFromHash(),
      false
    );

    const highlightList = [];
    const commentList = [];
    const doodleList = [];
    for (const note of notes) {
      const canvasObj = await canvasNoteServices.addNoteToCanvas(
        noteFormatServices,
        note,
        this.renderContextMenu,
        this.props.pdfId
      );
      // const canvasObj = await this.addNoteToCanvas(note, canvas);
      switch (canvasObj.noteType) {
        case "QuoteNote":
          highlightList.push(canvasObj);
          break;

        case "CommentNote":
          commentList.push(canvasObj);
          break;

        case "Doodle":
          doodleList.push(canvasObj);
          break;

        default:
          break;
      }
    }

    // Trigger the mouse up event on the canvas
    this.state.canvas.fire("mouse:dblclick");

    const topAmount = this.updateTopAmount({
      highlights: highlightList,
      comments: commentList,
    });

    const fabricContainerResizeObserver = new ResizeObserver((entries) => {
      if (entries[0].contentRect) {
        const { width, height } = entries[0].contentRect;
        if (this.state.isMobile) {
          this.state.canvas.setDimensions({
            width: window.innerWidth + 50,
            height: height + 50,
          });
          this.state.canvas.renderAll();
          return;
        }
        this.state.canvas.setDimensions({
          width: width + 50,
          height: height + 50,
        });
        this.state.canvas.renderAll();
      }
    });

    fabricContainerResizeObserver.observe(
      document.querySelector(".fabric-container")
    );

    this.setState({
      highlights: highlightList,
      comments: commentList,
      doodles: doodleList,
      topAmount: topAmount,
    });
    this.state.canvas.requestRenderAll();
  }

  render() {
    const {
      url,
      highlights,
      canvas,
      textInput,
      topAmount,
      showContextMenu,
      targetPointer,
      isQuoteNote,
      isCommentNote,
      isDoodle,
      isCanvas,
      isFileUploaded,
      domPointerPool,
      renderPdfToQuoteArrow,
      pdfHighlighterRef,
      showNoteToolbar,
      isMobile,
      connectionView,
      showSearch,
      activeNoteCoord,
      canvasBuffer,
    } = this.state;

    return (
      <div className="relative">
        {renderPdfToQuoteArrow && (
          <Xarrow
            SVGcanvasStyle={{
              opacity: renderPdfToQuoteArrow ? 1 : 0,
              transition: "opacity 0.5s ease-in-out forwards",
              animation:
                "fade-in 0.5s ease-in-out forwards, fade-out 0.5s ease-in-out 1.5s forwards",
            }}
            zIndex={40}
            start={renderPdfToQuoteArrow.startRef}
            end={renderPdfToQuoteArrow.endRef}
            curveness={0.8}
            strokeWidth={3}
            startAnchor={{ position: "auto", offset: { y: 20 } }}
            showHead={false}
            color="#2cd4bf"
            gridBreak="100%-100%"
            arrowBodyProps={{
              strokeLinecap: "round",
            }}
          />
        )}
        <Split
          // style={{ height: "calc(100vh - 4rem)" }}
          className="split md:flex h-[calc(100vh-56px)] bg-slate-300"
          direction={isMobile ? "vertical" : "horizontal"}
          gutterSize={3}
          minSize={[310, 0]}
          onDrag={() => {
            if (!renderPdfToQuoteArrow) {
              this.resetPdfToQuoteArrow();
            } else if (domPointerPool) {
              this.updateCanvasLineAndPointers();
            }
          }}
        >
          <div className="flex flex-col justify-between !w-full h-auto md:!h-full">
            <WorkspaceToolbar
              className="relative"
              workspaceId={this.props.workspaceId}
            />

            {isFileUploaded ? (
              <div
                ref={pdfHighlighterRef}
                className="split--left bg-slate-300 relative !w-full h-full md:w-auto md:!h-[calc(100vh-3.5rem)]" //md:!h-[calc(100vh-7.5rem)]
              >
                {domPointerPool["pdfHighlight"] && (
                  <DomPointer
                    key={domPointerPool["pdfHighlight"].objectPointerId}
                    ref={domPointerPool["pdfHighlight"].ref}
                  />
                )}

                <div
                  className="relative md:mx-8 w-full h-full md:w-auto md:h-full"
                  onWheel={(e) => this.resetPdfToQuoteArrow(e)}
                >
                  <PdfLoader
                    url={url}
                    beforeLoad={<Spinner />}
                    httpHeaders={{ Authorization: `${Cookies.get("token")}` }}
                  >
                    {(pdfDocument) => (
                      <PdfHighlighter
                        pdfDocument={pdfDocument}
                        enableAreaSelection={(event) => event.altKey}
                        onScrollChange={highlightServices.resetHash}
                        // pdfScaleValue="page-width"
                        scrollRef={(scrollTo) => {
                          highlightServices.scrollViewerTo = scrollTo;

                          highlightServices.scrollToHighlightFromHash();
                        }}
                        onSelectionFinished={(
                          position,
                          content,
                          hideTipAndSelection,
                          transformSelection
                        ) => (
                          // <Tip
                          //   onOpen={() => {
                          //     this.addHighlight({ content, position });
                          //     hideTipAndSelection();
                          //   }}
                          // />
                          <CommentPopup
                            onOpen={() => {
                              this.addHighlight({ content, position });
                              hideTipAndSelection();
                            }}
                            onBullet={() => {
                              this.addOpenAiNote(
                                { content, position },
                                "Bullet Point"
                              );
                              hideTipAndSelection();
                            }}
                            onElaborate={() => {
                              this.addOpenAiNote(
                                { content, position },
                                "Elaborate"
                              );
                              hideTipAndSelection();
                            }}
                            onSummarize={() => {
                              this.addOpenAiNote(
                                { content, position },
                                "Summarize"
                              );
                              hideTipAndSelection();
                            }}
                          />
                        )}
                        highlightTransform={(
                          highlight,
                          index,
                          setTip,
                          hideTip,
                          viewportToScaled,
                          screenshot,
                          isScrolledTo
                        ) => {
                          const isTextHighlight = !Boolean(
                            highlight.content && highlight.content.image
                          );

                          const component = isTextHighlight ? (
                            <Highlight
                              isScrolledTo={isScrolledTo}
                              position={highlight.position}
                              comment={highlight.comment}
                            />
                          ) : (
                            <AreaHighlight
                              isScrolledTo={isScrolledTo}
                              highlight={highlight}
                              onChange={(boundingRect) => {
                                this.updateHighlight(
                                  highlight.id,
                                  {
                                    boundingRect:
                                      viewportToScaled(boundingRect),
                                  },
                                  { image: screenshot(boundingRect) }
                                );
                              }}
                            />
                          );

                          return (
                            <Popup
                              popupContent={<HighlightPopup {...highlight} />}
                              onMouseOver={(popupContent) =>
                                setTip(highlight, (highlight) => popupContent)
                              }
                              onMouseOut={hideTip}
                              key={index}
                              children={component}
                            />
                          );
                        }}
                        highlights={highlights}
                      />
                    )}
                  </PdfLoader>
                </div>
              </div>
            ) : (
              <div className="p-8 !w-screen h-full md:!w-auto md:!h-[calc(100vh-4rem)]">
                <FileUpload workspaceId={this.props.workspaceId} />
              </div>
            )}
          </div>

          {/* <div className={isMobile ? "gutter-vertical gutter" : "gutter-horizontal gutter"} style="width: 2px;"></div> */}

          <div className="fabric-container w-screen relative md:h-[100vh]">
            <MainToolbar
              colorPicker={this.state.colorPicker}
              colorPickerColor={this.state.colorPickerColor}
              toggleColorPicker={() => this.toggleColorPicker()}
              handleChangeComplete={this.handleChangeComplete}
              handleSearchClick={() =>
                this.setState({ showSearch: !showSearch })
              }
              showSearch={showSearch}
              allConnections={this.state.allConnections}
              handleAllConnections={this.handleAllConnections}
              handleConnectionView={this.handleConnectionView}
              connectionView={this.state.connectionView}
              addComment={this.addComment}
              handleTogglePan={() => this.toggleMode("pan")}
              handleToggleDrawing={() => this.toggleMode("drawing")}
              selectedPanColor={this.state.selectedPanColor}
              selectedBrushColor={this.state.selectedBrushColor}
              handleUndo={() => {
                undoRedoServices.undoCanvas(
                  canvasHistory,
                  currentMode,
                  undoRedoServices.objList,
                  undoRedoServices.strokeGroup,
                  this.renderContextMenu
                );
              }}
              handleRedo={() => {
                undoRedoServices.redoCanvas(
                  canvasHistory,
                  this.renderContextMenu
                );
              }}
            />

            <div
              className="canvas-div"
              ref={(el) => (this.childEl = el)}
              onContextMenu={(e) => {
                e.preventDefault();
                return false;
              }}
            >
              <canvas id="canvas" ref={this.workspaceCanvasRef} />

              {!connectionView && showNoteToolbar && (
                <NoteFormatToolbar
                  noteFormatServices={noteFormatServices}
                  activeNoteCoord={activeNoteCoord}
                  isMobile={isMobile}
                  selectedNote={canvas.getActiveObject()}
                />
              )}

              {showContextMenu && (
                <ContextMenu
                  onClose={this.closeContextMenu}
                  onOpen={this.openContextMenu}
                  handleDelete={this.handleDeleteNote}
                  handleCopy={this.handleCopyNote}
                  handleGoToHighlight={this.handleGoToHighlight}
                  handleCommentLink={this.handleCommentLink}
                  handleCut={this.handleCut}
                  handlePaste={this.handlePaste}
                  handleChatGpt={this.handleOpenAi}
                  {...this.state.targetPointer}
                  isQuoteNote={isQuoteNote}
                  isCommentNote={isCommentNote}
                  isDoodle={isDoodle}
                  isCanvas={isCanvas}
                  canvasBuffer={canvasBuffer}
                />
              )}
              {domPointerPool["canvasNote"] && (
                <DomPointer
                  key={domPointerPool["canvasNote"].objectPointerId}
                  ref={domPointerPool["canvasNote"].ref}
                />
              )}
            </div>
          </div>
        </Split>

        {showSearch && (
          <SearchPopup
            handleSearchClose={this.handleSearchClose}
            onChange={this.handleSearch}
            onResultClick={this.handleSearchResultClick}
            results={this.state.searchResults}
          />
        )}
      </div>
    );
  }
}

export default HighlightDemo;
