"use strict";

import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

const MIN_LABEL_LENGTH = 0;
const CKPT_META_KEYS = {
  "vae":       `${"VAE".padEnd(MIN_LABEL_LENGTH, " ")}`,
  "size":      `${"Size".padEnd(MIN_LABEL_LENGTH, " ")}`,
  "seed":      `${"Seed".padEnd(MIN_LABEL_LENGTH, " ")}`,
  "steps":     `${"Steps".padEnd(MIN_LABEL_LENGTH, " ")}`,
  "cfg":       `${"CFG scale".padEnd(MIN_LABEL_LENGTH, " ")}`,
  "sampler":   `${"Sampler".padEnd(MIN_LABEL_LENGTH, " ")}`,
  "scheduler": `${"Scheduler".padEnd(MIN_LABEL_LENGTH, " ")}`,
  "denoise":   `${"Denoising strength".padEnd(MIN_LABEL_LENGTH, " ")}`,
  "pp":        `${"Positive prompt".padEnd(MIN_LABEL_LENGTH, " ")}`,
  "np":        `${"Negative prompt".padEnd(MIN_LABEL_LENGTH, " ")}`,
};

const CKPT_TYPES = [
  "CheckpointLoaderSimple",
  "Load Checkpoint",
  "CheckpointLoader|pysssss",
  "Checkpoint Loader", // WAS
  "CheckpointLoaderSimpleShared //Inspire",
];

let ckptMap = {};

async function getCkptWorkflows() {
  const response = await api.fetchApi(`/shinich39/comfyui-civitai-workflow/load`, {
    method: "GET",
    headers: { "Content-Type": "application/json", },
  });

  if (response.status !== 200) {
    throw new Error(response.statusText);
  }

  return await response.json();
}

function findCkpt(filename) {
  if (typeof filename == "object" && typeof filename.content == "string") {
    filename = filename.content;
  }
  if (typeof filename != "string") {
    return;
  }
  return ckptMap[filename];
}

function parseSampler(str) {
  str = str.toLowerCase();

  let sampler = "euler", 
      scheduler = "normal";

  if (str.indexOf("euler a") > -1) {
    sampler = "euler_ancestral";
  } else if (str.indexOf("heunpp2") > -1) {
    sampler = "heunpp2";
  } else if (str.indexOf("heun") > -1) {
    sampler = "heun";
  } else if (str.indexOf("dpm++ 2m") > -1) {
    sampler = "dpmpp_2m";
  } else if (str.indexOf("dpm++ sde") > -1) {
    sampler = "dpmpp_sde";
  } else if (str.indexOf("dpm++ 2s a") > -1) {
    sampler = "dpmpp_2s_ancestral";
  } else if (str.indexOf("dpm++ 2s") > -1) {
    sampler = "dpmpp_2s_ancestral";
  } else if (str.indexOf("dpm2 a") > -1) {
    sampler = "dpm_2_ancestral";
  } else if (str.indexOf("dpm2") > -1) {
    sampler = "dpm_2";
  } else if (str.indexOf("dpm adaptive") > -1) {
    sampler = "dpm_adaptive";
  } else if (str.indexOf("dpm fast") > -1) {
    sampler = "dpm_fast";
  } else if (str.indexOf("ddpm") > -1) {
    sampler = "ddpm";
  } else if (str.indexOf("ddim") > -1) {
    sampler = "ddim";
  } else if (str.indexOf("uni") > -1) {
    sampler = "uni";
  } else if (str.indexOf("lms") > -1) {
    sampler = "lms";
  }

  if (str.indexOf("karras") > -1) {
    scheduler = "karras";
  } else if (str.indexOf("simple") > -1) {
    scheduler = "simple";
  } else if (str.indexOf("exponential") > -1) {
    scheduler = "exponential";
  }

  return [sampler, scheduler];
}

function parseSize(str) {
  str = str.toLowerCase();

  let width = 512, height = 512;

  const parts = str.split("x");
  const w = parseInt(parts[0] || "");
  const h = parseInt(parts[1] || "");

  if (!isNaN(w) && !isNaN(h)) {
    width = w;
    height = h;
  }

  return [width, height];
}

function createCkptContent(ckpt, meta) {
  let str = "";
  str += `Model: ${ckpt.modelName}\n`;
  str += `Version: ${ckpt.versionName}\n`;
  try {
    if (!ckpt.updatedAt) {
      throw new Error("[comfyui-civitai-workflow] Updated date not found");
    }
    str += `Updated: ${new Date(ckpt.updatedAt).toISOString().substring(0, 10)}\n\n`;
  } catch(err) {
    console.error(err);
    str += `Updated: ${err.message}\n\n`;
  }

  str += `Model URL: https://civitai.com/models/${ckpt.modelId}?modelVersionId=${ckpt.versionId}\n`;
  str += `Image URL: https://civitai.com/images/${meta.id}\n\n`;

  for (const [key, prefix] of Object.entries(CKPT_META_KEYS)) {
    const value = meta[key];
    if (!value) {
      continue;
    }
    str += prefix + ":\n" + value + "\n\n";
  }

  return str.trim();
}

function openURL(url) {
  window.open(url, '_blank').focus();
}

app.registerExtension({
	name: `shinich39.CivitaiWorkflow`,
  setup() {
    getCkptWorkflows()
      .then(({ checkpoints }) => {
        ckptMap = checkpoints || {};

        const ckptCount = Object.keys(checkpoints).length;

        console.log(`[comfyui-civitai-workflow] Civitai checkpoints loaded successfully: ${ckptCount}`);
      });
  },
  async beforeRegisterNodeDef(nodeType, nodeData, app) {
		const isCkpt = CKPT_TYPES.indexOf(nodeType.comfyClass || nodeData.name) > -1;
    if (isCkpt) {
      const origGetExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
      nodeType.prototype.getExtraMenuOptions = function (_, options) {
        const r = origGetExtraMenuOptions ? origGetExtraMenuOptions.apply(this, arguments) : undefined;

        try {
          const ckptWidget = this.widgets.find((w) => w.name == "ckpt_name");
          if (!ckptWidget) {
            return r;
          }
  
          const ckptName = ckptWidget.value;
          const ckpt = findCkpt(ckptName);

          const metadatas = ckpt?.metas || [];
          const workflows = ckpt?.workflows || [];

          const createWorkflow = (meta) => {
            return {
              last_node_id: 9,
              last_link_id: 9,
              nodes: [
                {
                  id: 39,
                  type: "Note",
                  pos: [863, 186 + 262 + 39 * 1.5],
                  size: [425.27801513671875, 390],
                  flags: {},
                  order: 3,
                  mode: 0,
                  inputs: [],
                  outputs: [],
                  properties: {},
                  widgets_values: [
                    createCkptContent(ckpt, meta)
                  ]
                },
                {
                  id: 7,
                  type: "CLIPTextEncode",
                  pos: [413, 389],
                  size: [425.27801513671875, 180.6060791015625],
                  flags: {},
                  order: 3,
                  mode: 0,
                  inputs: [{ name: "clip", type: "CLIP", link: 5 }],
                  outputs: [
                    {
                      name: "CONDITIONING",
                      type: "CONDITIONING",
                      links: [6],
                      slot_index: 0
                    }
                  ],
                  properties: {},
                  widgets_values: [
                    meta.np || ""
                  ]
                },
                {
                  id: 6,
                  type: "CLIPTextEncode",
                  pos: [415, 186],
                  size: [422.84503173828125, 164.31304931640625],
                  flags: {},
                  order: 2,
                  mode: 0,
                  inputs: [{ name: "clip", type: "CLIP", link: 3 }],
                  outputs: [
                    {
                      name: "CONDITIONING",
                      type: "CONDITIONING",
                      links: [4],
                      slot_index: 0
                    }
                  ],
                  properties: {},
                  widgets_values: [
                    meta.pp || ""
                  ]
                },
                {
                  id: 5,
                  type: "EmptyLatentImage",
                  pos: [473, 609],
                  size: [315, 106],
                  flags: {},
                  order: 1,
                  mode: 0,
                  outputs: [{ name: "LATENT", type: "LATENT", links: [2], slot_index: 0 }],
                  properties: {},
                  widgets_values: [
                    ...parseSize(meta.size || ""),
                    // 512, 
                    // 512, 
                    1
                  ]
                },
                {
                  id: 3,
                  type: "KSampler",
                  pos: [863, 186],
                  size: [315, 262],
                  flags: {},
                  order: 4,
                  mode: 0,
                  inputs: [
                    { name: "model", type: "MODEL", link: 1 },
                    { name: "positive", type: "CONDITIONING", link: 4 },
                    { name: "negative", type: "CONDITIONING", link: 6 },
                    { name: "latent_image", type: "LATENT", link: 2 }
                  ],
                  outputs: [{ name: "LATENT", type: "LATENT", links: [7], slot_index: 0 }],
                  properties: {},
                  widgets_values: [
                    meta.seed || 0, 
                    true, 
                    meta.steps || 20, 
                    meta.cfg || 8, 
                    ...parseSampler(meta.sampler || ""),
                    // "euler", 
                    // "normal", 
                    1, // meta.denoise || 1
                  ]
                },
                {
                  id: 8,
                  type: "VAEDecode",
                  pos: [1209, 188],
                  size: [210, 46],
                  flags: {},
                  order: 5,
                  mode: 0,
                  inputs: [
                    { name: "samples", type: "LATENT", link: 7 },
                    { name: "vae", type: "VAE", link: 8 }
                  ],
                  outputs: [{ name: "IMAGE", type: "IMAGE", links: [9], slot_index: 0 }],
                  properties: {}
                },
                {
                  id: 9,
                  type: "SaveImage",
                  pos: [1451, 189],
                  size: [210, 26],
                  flags: {},
                  order: 6,
                  mode: 0,
                  inputs: [{ name: "images", type: "IMAGE", link: 9 }],
                  properties: {}
                },
                {
                  id: 4,
                  type: "CheckpointLoaderSimple",
                  pos: [26, 474],
                  size: [315, 98],
                  flags: {},
                  order: 0,
                  mode: 0,
                  outputs: [
                    { name: "MODEL", type: "MODEL", links: [1], slot_index: 0 },
                    { name: "CLIP", type: "CLIP", links: [3, 5], slot_index: 1 },
                    { name: "VAE", type: "VAE", links: [8], slot_index: 2 }
                  ],
                  properties: {},
                  widgets_values: [
                    ckptName
                  ]
                }
              ],
              links: [
                [1, 4, 0, 3, 0, "MODEL"],
                [2, 5, 0, 3, 3, "LATENT"],
                [3, 4, 1, 6, 0, "CLIP"],
                [4, 6, 0, 3, 1, "CONDITIONING"],
                [5, 4, 1, 7, 0, "CLIP"],
                [6, 7, 0, 3, 2, "CONDITIONING"],
                [7, 3, 0, 8, 0, "LATENT"],
                [8, 4, 2, 8, 1, "VAE"],
                [9, 8, 0, 9, 0, "IMAGE"]
              ],
              groups: [],
              config: {},
              extra: {},
              version: 0.4
            };
          }

          const workflowOptions = [];

          for (const wf of workflows) {
            workflowOptions.push({
              content: `#${workflowOptions.length + 1} (Comfy)`,
              callback: () => {
                const json = JSON.parse(wf);
                app.loadGraphData(json);
              }
            });
          }

          for (const meta of metadatas) {
            workflowOptions.push({
              content: `#${workflowOptions.length + 1}`,
              callback: () => {
                app.loadGraphData(createWorkflow(meta));
              }
            });
          }

          let optionIndex = options.findIndex((o) => o?.content === "Inputs");
          if (optionIndex < 0) {
            optionIndex = 0;
          }
          
          let newOptions = [
            {
              content: "Open civitai in a new tab",
              disabled: !ckpt,
              callback: () => {
                openURL(`https://civitai.com/models/${ckpt.modelId}?modelVersionId=${ckpt.versionId}`);
              }
            }, {
              content: "Workflows",
              disabled: workflowOptions.length < 1,
              submenu: {
                options: workflowOptions,
              },
            },
          ];
          
          options.splice(
            optionIndex,
            0,
            ...newOptions
          );
        } catch(err) {
          console.error(err);
        }

        return r;
      } 
    }
	},
});