# Exporte la scène du piano en glTF pour l aperçu web (drivers -> extras, étiquettes -> empties).
# Puis : convertir piano.glb en piano.json ({"gltf": ..., "bin": base64}) comme le fait le README.
import bpy, json
bpy.ops.wm.open_mainfile(filepath=__import__("os").path.join(__import__("os").path.dirname(__file__), "..", "piano_a_queue.blend"))
sc = bpy.context.scene
sc.timeline_markers.clear()
ctrl = bpy.data.objects["PIANO_Controle"]
ctrl.animation_data_clear()
for o in bpy.data.objects:
    if o.name.startswith("Touche ") and o.animation_data:
        o.animation_data.action = None
        o.rotation_euler = (0, 0, 0)
ctrl["explosion"] = 0.0; ctrl["explosion_detail"] = 0.0; ctrl["appui_demo"] = 0.0
sc.frame_set(1)
# record drivers as extras
for o in bpy.data.objects:
    if o.animation_data and o.animation_data.drivers:
        recs = []
        for fc in o.animation_data.drivers:
            d = fc.driver
            recs.append({"p": fc.data_path, "i": fc.array_index, "e": d.expression,
                         "v": [[v.name, v.targets[0].id.name, v.targets[0].data_path] for v in d.variables]})
        o["drv"] = json.dumps(recs)
# drop studio (camera, lights, floor)
for o in list(bpy.data.collections["Studio"].objects):
    bpy.data.objects.remove(o)
# text -> empties carrying the label text (rendered as HTML in the viewer)
for o in [o for o in bpy.data.objects if o.type == "FONT"]:
    body = o.data.body
    kind = "groupe" if o.constraints else ("legende" if "\n" in body else ("titre" if len(body) > 40 else "repere"))
    e = bpy.data.objects.new("LABEL " + o.name, None)
    for c in o.users_collection: c.objects.link(e)
    e.parent = o.parent
    e.matrix_parent_inverse = o.matrix_parent_inverse.copy()
    e.location = o.location
    e["label"] = body
    e["kind"] = kind
    if "drv" in o: e["drv"] = o["drv"]
    bpy.data.objects.remove(o)
# decimate nothing; export
bpy.ops.export_scene.gltf(filepath=__import__("os").path.join(__import__("os").path.dirname(__file__), "piano.glb"), export_format="GLB", export_extras=True,
    export_yup=True, export_animations=False, export_cameras=False, export_lights=False,
    export_apply=False, export_texcoords=False)
print("ok")
