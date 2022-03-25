export const attributesMockBoostNumberValid = {
  test: {
    type: "string",
    value: "mock",
  },
};

export const attributesMockNumberValid = {
  test: {
    type: "int",
    value: 2,
  },
  date: {
    type: "datetime",
    value: 1648209269044,
  },
};

export const attributesMockFloatValid = {
  test: {
    type: "float",
    value: 2.2,
  },
};

export const attributesMockBooleanValid = {
  test: {
    type: "boolean",
    value: true,
  },
};

export const attributesMockValueValid = {
  test: {
    type: "string",
    value: "2",
  },
  bool: {
    type: "boolean",
    value: true,
  },
};

export const metadataMockAllValid = {
  external_url: "https://youtube.com",
  image: "ipfs://ipfs/12345",
  image_data: "",
  description: "Mock description",
  name: "Mock 1",
  properties: attributesMockBoostNumberValid,
};

export const metadataMockAllValid2 = {
  image: "ipfs://ipfs/12345",
  description: "Mock description",
  name: "Mock 1",
  properties: attributesMockBoostNumberValid,
};

export const metadataMockAllValid4 = {
  image: "ipfs://ipfs/12345",
  properties: attributesMockNumberValid,
};

export const metadataMockAllValid6 = {
  image: "ipfs://ipfs/12345",
  properties: attributesMockValueValid,
};

