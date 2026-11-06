export const getLayoutOptions = (isFastMode, shouldAnimate, fit) => {
  if (isFastMode) {
    return {
      name: 'fcose',
      animate: false,
      randomize: false,
      fit,
      padding: 50,
      quality: 'default',
      nodeDimensionsIncludeLabels: true,
      nodeRepulsion: 4500,
      idealEdgeLength: 120,
      edgeElasticity: 0.45,
      nestingFactor: 0.1,
      gravity: 0.25,
      numIter: 1000,
    }
  }

  return {
    name: 'cose',
    animate: shouldAnimate,
    randomize: false,
    fit,
    padding: 50,
    componentSpacing: 100,
    nodeOverlap: 20,
    nodeDimensionsIncludeLabels: true,
  }
}
