import google.generativeai as genai

genai.configure(api_key="AIzaSyD5lmCaGXtcBiVQ7RgufT-P5PUmNLRhcgg")

for model in genai.list_models():
    print(model.name)