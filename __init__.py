"""
@author: shinich39
@title: comfyui-civitai-workflow
@nickname: comfyui-civitai-workflow
@version: 1.0.1
@description: Load workflow from civitai image.
"""

from .py import civitai

NODE_CLASS_MAPPINGS = {}

NODE_DISPLAY_NAME_MAPPINGS = {}

WEB_DIRECTORY = "./js"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]