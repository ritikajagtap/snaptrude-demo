import "@babylonjs/loaders";
import earcut from 'earcut';
import { ArcRotateCamera, Scene, Mesh, Nullable, Vector3, AbstractMesh, LinesMesh, StandardMaterial, Engine, MeshBuilder, HemisphericLight, AxesViewer, PointerEventTypes, Matrix, VertexBuffer, Color3 } from "@babylonjs/core";
import { AdvancedDynamicTexture, Control, Button } from "@babylonjs/gui";
class Playground {
    camera: ArcRotateCamera;
    scene: Scene;
    ground: Mesh;
    canvas: HTMLCanvasElement;
    extrudedMeshes: Mesh[] = [];
    startingPoint: Nullable<Vector3> = null;
    currentMesh: Nullable<AbstractMesh> = null;
    shapes: Vector3[][] = [];
    isDrawing = false;
    isMoving = false;
    isVertexEditing = false;
    shapelines: LinesMesh[] = [];
    spheres: Mesh[] = [];
    currentShapePoints: Vector3[] = [];
    dragBox: Nullable<Mesh> = null;
    dragBoxMat: StandardMaterial | null = null;
    currentPickedMesh: AbstractMesh | undefined;
    fidx: number | undefined;
    xIndexes: number[] = [];
    zIndexes: number[] = [];

    // constructor
    constructor(engine: Engine, canvas: HTMLCanvasElement){
        this.canvas = canvas;
        this.scene = new Scene(engine);
        this.camera = new ArcRotateCamera("camera", 0, 0, 0, new Vector3(0, 0, 0), this.scene);
        this.ground = MeshBuilder.CreateGround("ground", { width: 80, height: 80 }, this.scene);
        this.createScene(engine, canvas);
    }

    // creating the scene
    createScene(engine: Engine, canvas: HTMLCanvasElement) {
        this.camera.setPosition(new Vector3(5, 10, 20));
        this.camera.attachControl(canvas, true);
        this.camera.upperBetaLimit = Math.PI / 2;
        
        var light = new HemisphericLight("light", new Vector3(3, 1.5, 0), this.scene);
        light.intensity = 0.9;

       
        this.ground.visibility = 0.2;
        new AxesViewer(this.scene, 3);

        var advancedTexture = AdvancedDynamicTexture.CreateFullscreenUI("UI");
        advancedTexture.addControl(this.getDrawButton());
        advancedTexture.addControl(this.getExtrudeButton());
        advancedTexture.addControl(this.getMoveButton());
        advancedTexture.addControl(this.getVertexEditButton());

        // observing the pointer movement 
        this.scene.onPointerObservable.add((pointerInfo) => {
            switch (pointerInfo.type) {
                case PointerEventTypes.POINTERDOWN:
                    // Right mouse button
                    if (pointerInfo.event.button === 2) {
                        this.addDragBox();
                    }
                    else if (pointerInfo.pickInfo && pointerInfo.pickInfo.hit && pointerInfo.pickInfo.pickedMesh && pointerInfo.pickInfo.pickedMesh != this.ground) {
                        this.pointerDown(pointerInfo.pickInfo.pickedMesh)
                    }
                    break;
                case PointerEventTypes.POINTERUP:
                    this.pointerUp(pointerInfo.event);
                    break;
                case PointerEventTypes.POINTERMOVE:
                    this.pointerMove();
                    break;
            }
        });
    }
    // Vertex Editing
    addDragBox() {
        if (!this.isVertexEditing) return;
        this.disposeDragBox();
	    // createPickingRay for picking objects in the scene
        var ray = this.scene.createPickingRay(this.scene.pointerX, this.scene.pointerY, Matrix.Identity(), this.camera);
	    // if the mesh is picked by the user, pickWithRay gets the pickinginfo
        var pickingInfo = this.scene.pickWithRay(ray);
	    // pickedMesh: the mesh corresponding to the picked collision
        if (!!pickingInfo && !!pickingInfo.pickedMesh && pickingInfo.pickedMesh != this.ground) {
            this.xIndexes = [];
            this.zIndexes = [];
	        // storing to info of pickedmesh in currentPickedMesh
            this.currentPickedMesh = pickingInfo.pickedMesh;
            var wMatrix = pickingInfo.pickedMesh.computeWorldMatrix(true);
            pickingInfo.pickedMesh.isPickable = true;
	        // getting the vertex info from the pickedMesh
            var positions = pickingInfo.pickedMesh.getVerticesData(VertexBuffer.PositionKind);
	        // getting indices of the picked mesh
            var indices = pickingInfo.pickedMesh.getIndices();
	        //https://doc.babylonjs.com/features/featuresDeepDive/mesh/creation/set/box
	        // Creating a box
            this.dragBox = Mesh.CreateBox("dragBox", 0.15, this.scene);
            var vertexPoint = Vector3.Zero();
	        // faceId: face Index of the picked particle
            this.fidx = pickingInfo.faceId
            var minDist = Infinity;
            var dist = 0;
            var hitPoint = pickingInfo.pickedPoint;
            var idx = 0;
            var boxPosition = Vector3.Zero();
            if (!indices || !positions || !hitPoint) return;
            for (var i = 0; i < 3; i++) {
                idx = indices[3 * this.fidx + i]
                vertexPoint.x = positions[3 * idx];
                var initX = positions[3 * idx];
                vertexPoint.y = positions[3 * idx + 1];
                var initY = positions[3 * idx + 1];
                vertexPoint.z = positions[3 * idx + 2];
                var initZ = positions[3 * idx + 2];
                Vector3.TransformCoordinatesToRef(vertexPoint, wMatrix, vertexPoint);
                dist = vertexPoint.subtract(hitPoint).length();
                if (dist < minDist) {
                    boxPosition = vertexPoint.clone();
                    vertexPoint.x = initX;
                    vertexPoint.z = initZ;
                    minDist = dist;
                }
            } 
            this.dragBox.position = boxPosition;
            for (var i = 0; i < positions.length; i++) {
                if (positions[i] == vertexPoint.x) {
                    this.xIndexes.push(i);
                }
                if (positions[i] == vertexPoint.z) {
                    this.zIndexes.push(i);
                }
            }

            this.dragBoxMat = new StandardMaterial("dragBoxMat", this.scene);
            this.dragBoxMat.diffuseColor = new Color3(1.4, 3, 0.2);
            this.dragBox.material = this.dragBoxMat;
        }
    }

    public getScene(): Scene {
        return this.scene;
    }
    // returns the picked info
    getPosition(ground: boolean = true) {
        if (this.scene) {
            var pickinfo = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (mesh) => {
                return ground ? mesh == this.ground : true;
            });
            if (pickinfo && pickinfo.hit && pickinfo.pickedPoint) {
                if (pickinfo.pickedPoint.y < 0) {
                    pickinfo.pickedPoint.y = 0;
                }
                return pickinfo.pickedPoint;
            }
        }

        return null;
    }
    // Mouse key is pressed in the scene
    pointerDown(mesh: AbstractMesh) {
        // if isMoving is true
        if (this.isMoving) {
            this.currentMesh = mesh;
            const moveMaterial = new StandardMaterial("moveMaterial", this.scene);
            moveMaterial.diffuseColor = new Color3(255,0,0);
            
            this.currentMesh.material = moveMaterial;
            // getting position of the pointer
            this.startingPoint = this.getPosition();

            // Disconnecting the camera from canvas as the pointer is moving the mesh
            if (this.startingPoint) {
                setTimeout(() => {
                    this.camera.detachControl(this.canvas);
                }, 0);
            }
        } else if (this.isVertexEditing && this.dragBox) {

            const moveMaterial = new StandardMaterial("moveMaterial", this.scene);
            moveMaterial.diffuseColor = new Color3(1, 1, 0);
            this.dragBox.material = moveMaterial;
            this.startingPoint = this.getPosition(false);
            if (this.startingPoint) {
                setTimeout(() => {
                    this.camera.detachControl(this.canvas);
                }, 0);
            }
        }
    }
    // Mouse key is released
    pointerUp(event: PointerEvent) {
        if (this.isMoving) {
            if (this.startingPoint) {
                this.camera.attachControl(this.canvas, true);
                if (this.currentMesh) {
                    this.currentMesh.material = null;
                }
                this.startingPoint = null;
                return;
            }
        } else if (this.isDrawing) {
            // Left click of Mouse
            if (event.button == 0) {
                if (this.isDrawing) {
                    const pickInfo = this.scene.pick(this.scene.pointerX, this.scene.pointerY);
                    // here .hit returns if the point collided with some object (boolean)
                    // .pickedPoint gives the location of the collision (vector)
                    if (pickInfo && pickInfo.hit && pickInfo.pickedPoint) {
                        // point will be created as the user clicks on left click
                        var sphere = MeshBuilder.CreateSphere("pointSphere", { diameter: .2, segments: 16 });
                        // we are considering the 2D horizontal plane that's why have have considered x and z axis.
                        sphere.position.x = pickInfo.pickedPoint.x;
                        sphere.position.z = pickInfo.pickedPoint.z;
                        this.currentShapePoints.push(pickInfo.pickedPoint);
                        this.spheres.push(sphere);
                    }
                }else {
                    return;
                }
            // Right click of Mouse
            } else if (event.button == 2) {
                
                if (!this.isDrawing) return;
                // connecting the points
                this.drawShape(this.scene);
                if (!this.shapes) this.shapes = [];
                // pushing the current shapt in shapes vector
                this.shapes.push(this.currentShapePoints);
                // declaring currect shapes as NULL
                this.currentShapePoints = [];
            }
        } else if (this.isVertexEditing) {
            // Vertext editing is on and the mouse key is released
            if (this.startingPoint) {
                // camera will be given the cotrol back
                this.camera.attachControl(this.canvas, true);

                if (this.dragBox) {
                    this.dragBox.material = this.dragBoxMat;
                }
                this.startingPoint = null;
                this.disposeDragBox();
            }
        }
    }
    // When the user will move the cursor
    pointerMove() {
        if (this.isMoving) {
            // if startingPoint vector is empty and currentMESH is empty
            if (!this.startingPoint || !this.currentMesh) {
                return;
            }
            // getting the position of the pointer
            var current = this.getPosition();
            if (!current) {
                return;
            }
            // subtracting current position with the starting point
            var diff = current.subtract(this.startingPoint);

            // adding the difference to the current position of the mesh
            this.currentMesh.position.addInPlace(diff);

            // starting point will be current
            this.startingPoint = current;
        } else if (this.isVertexEditing) {
            // if starting point vector is empty and dragbox is empty
            if (!this.startingPoint || !this.dragBox) {
                return;
            }
            // getting position
            var current = this.getPosition(false);
            // if faceID is NULL or not equal to 0
            if (!current || !this.currentPickedMesh || (!this.fidx && this.fidx != 0)) {
                return;
            }
            // finding the difference
            var diff = current.subtract(this.startingPoint);
            this.dragBox.position.addInPlace(diff);

            this.startingPoint = current;
            
            var positions = this.currentPickedMesh.getVerticesData(VertexBuffer.PositionKind);
            var indices = this.currentPickedMesh.getIndices();

            if (!positions || !indices) {
                return;
            }
            // updating the positions vector for x cordinates
            for (var i = 0; i < this.xIndexes.length; i++) {
                positions[this.xIndexes[i]] = current.x;
            }
            // updating the positions vector for z cordinates
            for (var i = 0; i < this.zIndexes.length; i++) {
                positions[this.zIndexes[i]] = current.z;
            }
            // updating the vertices data
            this.currentPickedMesh.updateVerticesData(VertexBuffer.PositionKind, positions);
        }
    }
    // when the right click is pressed in the draw mode, the points will get connected and form a shape
    drawShape(scene: Scene) {
        // pushing the first element in the array at the last position 
        this.currentShapePoints.push(this.currentShapePoints[0]);
        // creating line string argument, array, scene
        var shapeline = Mesh.CreateLines("s1", this.currentShapePoints, scene);
        shapeline.color = Color3.Blue();
        this.shapelines.push(shapeline);
    }

    // draw button
    getDrawButton(): Control {
        // creating UI Button
        var drawButton = this.CreateUIButton("drawBtn", "Draw", "left");
        // when the draw button is pressed
        drawButton.onPointerUpObservable.add(() => {
            // if the object is in move mode then return
            if (this.isMoving) return;
            
            if (drawButton.textBlock) {
                // if the user pressed the drwa button for the first time
                if (!this.isDrawing) {
                    drawButton.background = "red";
                    drawButton.textBlock.text = "EXIT";
                    this.isDrawing = true;
                } else {   
                    // if the user is pressing the draw button for the second time  
                    drawButton.background = "purple";
                    drawButton.textBlock.text = "Draw";
                    // make isDrawing variable as false
                    this.isDrawing = false;
                }
            }
        });
        return drawButton;
    }
    // move button
    getMoveButton(): Control {
        // creating UI button
        var moveButton = this.CreateUIButton("moveBtn", "Move", "center");
        // if the button is pressed and released 
        moveButton.onPointerUpObservable.add(() => {
            // if drawing then return
            if (this.isDrawing) return;

            if (moveButton.textBlock) {
                // if the user pressed the move button for the first time
                if (!this.isMoving) {
                    // the button will turn red and text will be exit
                    moveButton.background = "red";
                    moveButton.textBlock.text = "EXIT";
                    // making the isMoving variable as true
                    this.isMoving = true;
                } else {
                    // the user is already in move mode and has clicked the button for the second time
                    moveButton.background = "purple";
                    moveButton.textBlock.text = "Move";
                    // isMoving variable is turned false
                    this.isMoving = false;
                }
            }
        });
        return moveButton;
    }

    // vertext editing
    getVertexEditButton(): Control {
        // creating button for vertext edit
        var vertexEditButton = this.CreateUIButton("vertexEditBtn", "Vertex Edit", "right");

        vertexEditButton.onPointerUpObservable.add(() => {
            // checking if the user is in drawing mode or moving mode
            // if yes, return
            if (this.isDrawing || this.isMoving) return;
            // textBlock is being used for displaying the text on UI
            if (vertexEditButton.textBlock) {
                // if isVertextEditing variable is false, that means it is not in vertex editing mode

                if (!this.isVertexEditing) {
                    // if the user clicks on vertext Edit button when it is not in vertext editing mode the text will change to "Exit"
                    vertexEditButton.background = "red";
                    vertexEditButton.textBlock.text = "EXIT";
                    this.isVertexEditing = true;
                
                } else {
                    // if the user clicks on vertext Edit button when it is in vertext editing mode the text will change to "Vertext Edit again"
                    vertexEditButton.background = "purple";
                    vertexEditButton.textBlock.text = "Vertex Edit";
                    // disposing the drag box
                    this.disposeDragBox();
                    // Emptying the vector of extrudedmeshes when the user exits the vertext edit mode
                    if (this.extrudedMeshes && this.extrudedMeshes.length > 0) {
                        for (const extrudedMesh of this.extrudedMeshes) {
                            extrudedMesh.material = null;
                        }
                        // setting the vertextEdit value as false
                        this.isVertexEditing = false;
                    }
                }
            }
        });
        return vertexEditButton;
    }
    // Releasing the resources of dragbox
    disposeDragBox() {
        if (this.dragBox) {
            this.dragBox.dispose();
            this.dragBox = null;
        }
    }
    // extrusion button
    getExtrudeButton(): Control {
        // creating the UI button
        var extrudeButton = this.CreateUIButton("extrudeBtn", "Extrude", "top");
        extrudeButton.onPointerUpObservable.add(() => {
            if (this.isDrawing || this.isMoving) return;
            if (this.shapes && this.shapes.length > 0) {
                // iterating through the 2D vector shapes
                for (const shape of this.shapes) {
                    // using Extrude Polygon
                    const extrudedMesh = MeshBuilder.ExtrudePolygon("polygon", {
                        shape: shape,
                        depth: 2,
                        sideOrientation: Mesh.DOUBLESIDE,
                        updatable: true,
                        wrap: true
                        // earcut here is used for handling twitsed polygons
                    }, this.scene, earcut.default);
                    extrudedMesh.position.y = 1.5;
                    // convertToFlatShadedMesh() used to construct box from different faces
                    extrudedMesh.convertToFlatShadedMesh();
                    // making extrudedMeshes empty
                    if (!this.extrudedMeshes) this.extrudedMeshes = [];
                    // pushing the extrudedMesh in the vector
                    this.extrudedMeshes.push(extrudedMesh);
                }
                this.shapes = [];
                // Releasing the resources held by objects
                this.disposeDrawingCues();
            }

        });
        // returning 
        return extrudeButton;
    }
    
    // Releasing the resources held by objects
    disposeDrawingCues() {
        
        if (this.shapelines && this.shapelines.length > 0) {
            // iterating over the shapeline vector 
            for (const shapeline of this.shapelines) {
                // disposing
                shapeline.dispose();
            }
            // emptying the vector
            this.shapelines = [];
        }
        // if speres vector is not empty
        if (this.spheres && this.spheres.length > 0) {
            // iterating over the 2D vector
            for (const sphere of this.spheres) {
                // disposing
                sphere.dispose();
            }
            // emptying
            this.spheres = [];
        }
    }

    CreateUIButton(name: string, text: string, position: string): Button {
        var button = Button.CreateSimpleButton(name, text);
        button.width = "120px"
        button.height = "60px";
        button.color = "white";
        if (position == "left") {
            button.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
            button.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            button.left = "10px";
        } else if (position == "center") {
            button.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
            button.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        } else if (position == "right") {
            button.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
            button.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
            button.paddingRight = "10px";
        } else if (position == "top") {
            button.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
            button.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            button.top = "10px";
        }
        button.paddingBottom = "10px";
        button.cornerRadius = 10;
        button.background = "purple";
        return button;
    }
}

export function CreatePlaygroundScene(engine: Engine, canvas: HTMLCanvasElement): Scene {
    return new Playground(engine, canvas).getScene();
}