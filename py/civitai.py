import os
import json
import hashlib
import traceback
import requests
import gzip
import io
import folder_paths

from server import PromptServer
from aiohttp import web

__DIRNAME = os.path.dirname(os.path.abspath(__file__))

CKPT_FILE_PAHTS = (
  *[folder_paths.get_full_path("checkpoints", x) for x in folder_paths.get_filename_list("checkpoints")],
  *[folder_paths.get_full_path("diffusion_models", x) for x in folder_paths.get_filename_list("diffusion_models")],
)

JSON_DIR_PATH = os.path.join(__DIRNAME, "..", "data")

LATEST_DATA_PATH = os.path.join(JSON_DIR_PATH, "latest.json")
CKPT_DATA_PATH = os.path.join(JSON_DIR_PATH, "checkpoints.json")

REPO_URL = "https://github.com/shinich39/civitai-model-json"
LATEST_DATA_URL = "https://raw.githubusercontent.com/shinich39/civitai-model-json/refs/heads/main/dist/latest.json"
CKPT_DATA_URL = "https://raw.githubusercontent.com/shinich39/civitai-model-json/refs/heads/main/dist/checkpoints.json.gz"

def create_hash(file_path):
  with open(file_path, "rb") as f:
    return hashlib.sha256(f.read()).hexdigest().upper()
  
def read_hash(file_path):
  with open(file_path, "r") as f:
    return f.read()
  
def save_hash(file_path, hash):
  with open(file_path, "w") as f:
    f.write(hash)
    f.close()
  
def get_hashes():
  hashes = {}
  
  for file_path in CKPT_FILE_PAHTS:
    ckpt_filename = os.path.basename(file_path)
    name, ext = os.path.splitext(ckpt_filename)
    hash_filename = name + ".sha256"
    hash_file_path = os.path.join(os.path.dirname(file_path), hash_filename)
    
    try:
      hash = None
      if os.path.exists(hash_file_path) == False:
        print(f"[comfyui-civitai-workflow] {hash_filename} not found, wait for hash generation...")
        hash = create_hash(file_path)
        save_hash(hash_file_path, hash)
      else:
        hash = read_hash(hash_file_path)

      hashes[ckpt_filename] = hash
    except:
      pass

  return hashes

def get_remote_latest():
  try:
    res = requests.get(LATEST_DATA_URL)
    data = json.loads(res.text)
    return data
  except Exception:
    return None
  
def get_local_latest():
  try:
    if os.path.exists(LATEST_DATA_PATH) == True:
      with open(LATEST_DATA_PATH, "r") as f:
        return json.load(f)
  except Exception:
    return None

def get_ckpts():
  if os.path.exists(JSON_DIR_PATH) == False:
    os.mkdir(JSON_DIR_PATH)

  # Check updates
  local_data = get_local_latest()
  remote_data = get_remote_latest()

  remote_time = None
  if remote_data != None and "updatedAt" in remote_data:
    remote_time = remote_data["updatedAt"]

  local_time = None
  if local_data != None and "updatedAt" in local_data:
    local_time = local_data["updatedAt"]

  is_updated = os.path.exists(CKPT_DATA_PATH) == False or local_time != remote_time

  if is_updated == False:
    with open(CKPT_DATA_PATH, "r") as file:
      print(f"[comfyui-civitai-workflow] No updates found: {local_time} = {remote_time}")
      return json.load(file)
    
  # Save latest.json
  with open(LATEST_DATA_PATH, "w") as f:
    f.write(json.dumps(remote_data))
    f.close()
  
  # Download checkpoints.json
  print(f"[comfyui-civitai-workflow] New update available: {local_time} < {remote_time}")
  print(f"[comfyui-civitai-workflow] Downloading checkpoints.json.gz...")

  try:
    res = requests.get(CKPT_DATA_URL)
    print(f"[comfyui-civitai-workflow] Decompressing checkpoints.json.gz...")
    with gzip.GzipFile(fileobj=io.BytesIO(res.content)) as f:
      decompressed_data = f.read()

    text = decompressed_data.decode('utf-8')
    data = json.loads(text)
    with open(CKPT_DATA_PATH, "w") as f:
      f.write(json.dumps(data))
      f.close()

    print(f"[comfyui-civitai-workflow] checkpoints.json has been downloaded.")

    return data
  except Exception:
    print(traceback.format_exc())
    print(f"[comfyui-civitai-workflow] Failed to download.")

    try:
      if os.path.exists(CKPT_DATA_PATH) == True:
        with open(CKPT_DATA_PATH, "r") as file:
          return json.load(file)
    except:
      pass

    return []
  
def filter_ckpts(ckpts, hashes):
  result = {}
  for file_path in CKPT_FILE_PAHTS:
    name = os.path.basename(file_path)
    hash = hashes[name]
    for ckpt in ckpts:
      if hash in ckpt["hashes"]:
        result[name] = ckpt
        break
      elif name in ckpt["files"]:
        result[name] = ckpt
        break
  return result

@PromptServer.instance.routes.get("/shinich39/comfyui-civitai-workflow/load")
async def _load(request):
  try:
    hashes = get_hashes()
    ckpts = get_ckpts()
    filtered_ckpts = filter_ckpts(ckpts, hashes)

    return web.json_response({
      "checkpoints": filtered_ckpts
    })
  except Exception:
    print(traceback.format_exc())
    return web.Response(status=400)