// copyright 2018 harlyq, ISC license

AFRAME.registerComponent("snapto", {
  schema: {
    type: {
      default: "hitposition",
      oneof: "hitposition, hitnormal, gridsnap",
      /*#if dev*/description: "align the object to either the position of the hit pointing UP (hitposition), to the hit position with the up in the direction of the normal (hitnormal), or grid position (gridsnap)",/*#endif*/
      parse: x => x.toLowerCase(),
    },
  
    offset: {
      type: "vec3",
      /*#if dev*/description: "offset (in local coordinates) to apply to the node after it has been snapped into place",/*#endif*/
    },
  
    grid: {
      type: "vec3",
      default: {x: 1, y: 1, z: 1},
      if: {type: ["gridsnap"]},
      /*#if dev*/description: "grid spacing, centered on 0,0,0",/*#endif*/
    },
  
    objects: {
      default: "*",
      //type: "selectorAll", this pulls in everything in the current document, but we just want to check children of the current scene
      if: {type: ["hitposition", "hitnormal"]},
      /*#if dev*/description: "selector for determining which objects for the raycast, by default checks against all other objects in the scene",/*#endif*/
    },
  
    rayStart: {
      default: 0,
      if: {type: ["hitposition", "hitnormal"]},
      /*#if dev*/description: "start point along the 'direction' for the ray from the entities origin, can use -ve values to start behind the entity",/*#endif*/
    },
  
    direction: {
      type: "vec3",
      default: {x: 0, y: -1, z: 0},
      if: {type: ["hitposition", "hitnormal"]},
      /*#if dev*/description: "world direction of the ray for the snap test",/*#endif*/
    },

    continuous: {
      default: false,
      /*#if dev*/description: "if true, perform the snap every frame, good for moving objects, but computationally expensive (cannot be changed at runtime)",/*#endif*/
    }
  },
  
  multiple: false,

  init: function () {
    this.snapTo = this.snapTo.bind(this)
    this.objects = [] // cache the ground elements
    this.objectsNeedUpdate = true
    this.raycaster = new THREE.Raycaster()
    this.lastRotation = new THREE.Quaternion()
    this.origin = new THREE.Vector3().copy(this.el.object3D.position)

    // we only set up a tick if we need it
    if (this.data.continuous) {
      this.tick = this.snapTo
    }
  },

  update: function(oldData) {
    // ask to re-update the objects on the next frame
    this.objectsNeedUpdate = true

    // if continuous is false (aka no tick set up), we need to wait until the rendering 
    // has started to perform the snap so that the object3Ds are setup correctly
    if (!Object.getOwnPropertyDescriptor(this, "tick")) {
      if (this.el.sceneEl.renderStarted) {
        this.snapTo()
      } else {
        this.el.sceneEl.addEventListener("renderstart", this.snapTo)
      }
    }
  },

  snapTo: function() {
    switch (this.data.type) {
      case "hitnormal":
      case "hitposition":
        return this.snapToObjects()

      case "gridsnap":
        return this.snapToGrid()
    }
  },

  snapToGrid: (function() {
    const object3D = this.el.object3D
    const position = object3D.position
    const grid = this.data.grid
    const offset = this.data.offset

    let x = Math.floor(position.x / grid.x) * grid.x + offset.x
    let y = Math.floor(position.y / grid.y) * grid.y + offset.y
    let z = Math.floor(position.z / grid.z) * grid.z + offset.z
    object3D.position.set(x,y,z)
  }),

  snapToObjects: (function() {
    let UP = new THREE.Vector3(0,1,0)
    let faceWorldRotation = new THREE.Quaternion()
    let worldNormal = new THREE.Vector3()
    let rotation = new THREE.Quaternion()
    let point = new THREE.Vector3()
    let dir = new THREE.Vector3()
    let start = new THREE.Vector3()
    let intersections = []

    return function() {
      const data = this.data
      const object3D = this.el.object3D

      if (this.objectsNeedUpdate) {
        this.objectsNeedUpdate = false

        // list of objects to test against, excluding ourselves
        const els = data.objects ? this.el.sceneEl.querySelectorAll(data.objects) : this.el.sceneEl.children

        this.objects.length = 0
        for (let i = 0, n = els.length; i < n; i++) {
          let obj = els[i].object3D
          if (obj && obj.children && obj.children.length) this.objects.push(...obj.children)
        }

        // remove ourselves from the list of objects
        for (let i = 0, n = object3D.children.length; i < n; i++) {
          const selfIndex = this.objects.indexOf(object3D.children[i])
          if (selfIndex !== -1) this.objects.splice(selfIndex, 1)
        }
      }
  
      if (this.objects.length === 0) return
  
      dir.copy(data.direction).normalize()
      start.copy(dir).multiplyScalar(data.rayStart).add(this.origin)
  
      this.raycaster.set(start, dir)

      intersections.length = 0
      intersections = this.raycaster.intersectObjects(this.objects, false, intersections)
  
      if (intersections.length > 0) {
        const firstHit = intersections[0]
        if (data.type === "hitnormal" && firstHit.face) {
          // align the y axis of the object to the hit normal
          firstHit.object.getWorldQuaternion(faceWorldRotation)
          worldNormal.copy(firstHit.face.normal).applyQuaternion(faceWorldRotation).normalize()

          // worldNormal will represent the new Y axis for the object
          rotation.setFromUnitVectors(UP, worldNormal)

          // if another system has rotated the object since last time, then re-apply the rotates
          if (!object3D.quaternion.equals(this.lastRotation)) {
            rotation.multiply(object3D.quaternion)
          }
          
          point.copy(data.offset).applyQuaternion(rotation).add(firstHit.point)
          object3D.position.set(point.x, point.y, point.z)
          object3D.setRotationFromQuaternion(rotation)
          this.lastRotation.copy(object3D.quaternion)
        } else {
          // align the position of the object to the hit position
          point.copy(data.offset).add(firstHit.point)
          object3D.position.set(point.x, point.y, point.z)
        }
      }
    }
  })(),
})

