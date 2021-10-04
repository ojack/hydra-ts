import glslTransforms, { TransformDefinition } from './glsl/glsl-functions.js';
import GlslSource from './glsl-source';
import Output from './output';
import { Uniforms } from 'regl';

interface GeneratorFactoryOptions {
  defaultUniforms?: GeneratorFactory['defaultUniforms'];
  defaultOutput: GeneratorFactory['defaultOutput'];
  extendTransforms?: GeneratorFactory['extendTransforms'];
  changeListener?: GeneratorFactory['changeListener'];
}

export default class GeneratorFactory {
  defaultUniforms: Uniforms;
  defaultOutput: Output;
  extendTransforms: TransformDefinition | TransformDefinition[];
  changeListener: (options: any) => void;
  generators: Record<string, () => GlslSource> = {};
  glslTransforms: Record<string, TransformDefinition> = {};
  sourceClass: typeof GlslSource = createSourceClass();
  type = 'GeneratorFactory' as const;

  constructor({
    defaultUniforms = {},
    defaultOutput,
    extendTransforms = [],
    changeListener = () => {},
  }: GeneratorFactoryOptions) {
    this.defaultOutput = defaultOutput;
    this.defaultUniforms = defaultUniforms;
    this.changeListener = changeListener;
    this.extendTransforms = extendTransforms;

    this.generators = Object.entries(this.generators).reduce((prev, [method]) => {
      this.changeListener({ type: 'remove', synth: this, method });
      return prev;
    }, {});

    this.sourceClass = createSourceClass();

    let functions = glslTransforms;

    // add user definied transforms
    if (Array.isArray(this.extendTransforms)) {
      functions.concat(this.extendTransforms);
    } else if (typeof this.extendTransforms === 'object' && this.extendTransforms.type) {
      functions.push(this.extendTransforms);
    }

    functions.map((transform) => this.setFunction(transform));
  }

  _addMethod(method: string, transform: TransformDefinition) {
    this.glslTransforms[method] = transform;
    if (transform.type === 'src') {
      const func = (...args: any[]) =>
        new this.sourceClass({
          name: method,
          transform: transform,
          userArgs: args,
          defaultOutput: this.defaultOutput,
          defaultUniforms: this.defaultUniforms,
          synth: this,
        });
      this.generators[method] = func;
      this.changeListener({ type: 'add', synth: this, method });
      return func;
    } else {
      // @ts-ignore
      this.sourceClass.prototype[method] = function (...args: any[]) {
        this.transforms.push({
          defaultOutput: this.defaultOutput,
          name: method,
          transform: transform,
          userArgs: args,
        });
        return this;
      };
    }
    return undefined;
  }

  setFunction(obj: TransformDefinition) {
    var processedGlsl = processGlsl(obj);
    if (processedGlsl) this._addMethod(obj.name, processedGlsl);
  }
}

const typeLookup = {
  src: {
    returnType: 'vec4',
    args: ['vec2 _st'],
  },
  coord: {
    returnType: 'vec2',
    args: ['vec2 _st'],
  },
  color: {
    returnType: 'vec4',
    args: ['vec4 _c0'],
  },
  combine: {
    returnType: 'vec4',
    args: ['vec4 _c0', 'vec4 _c1'],
  },
  combineCoord: {
    returnType: 'vec2',
    args: ['vec2 _st', 'vec4 _c0'],
  },
  renderpass: undefined,
};
// expects glsl of format
// {
//   name: 'osc', // name that will be used to access function as well as within glsl
//   type: 'src', // can be src: vec4(vec2 _st), coord: vec2(vec2 _st), color: vec4(vec4 _c0), combine: vec4(vec4 _c0, vec4 _c1), combineCoord: vec2(vec2 _st, vec4 _c0)
//   inputs: [
//     {
//       name: 'freq',
//       type: 'float', // 'float'   //, 'texture', 'vec4'
//       default: 0.2
//     },
//     {
//           name: 'sync',
//           type: 'float',
//           default: 0.1
//         },
//         {
//           name: 'offset',
//           type: 'float',
//           default: 0.0
//         }
//   ],
//  glsl: `
//    vec2 st = _st;
//    float r = sin((st.x-offset*2/freq+time*sync)*freq)*0.5  + 0.5;
//    float g = sin((st.x+time*sync)*freq)*0.5 + 0.5;
//    float b = sin((st.x+offset/freq+time*sync)*freq)*0.5  + 0.5;
//    return vec4(r, g, b, 1.0);
// `
// }

// // generates glsl function:
// `vec4 osc(vec2 _st, float freq, float sync, float offset){
//  vec2 st = _st;
//  float r = sin((st.x-offset*2/freq+time*sync)*freq)*0.5  + 0.5;
//  float g = sin((st.x+time*sync)*freq)*0.5 + 0.5;
//  float b = sin((st.x+offset/freq+time*sync)*freq)*0.5  + 0.5;
//  return vec4(r, g, b, 1.0);
// }`

function processGlsl(obj: TransformDefinition): TransformDefinition | undefined {
  let t = typeLookup[obj.type];

  if (!t) {
    console.warn(`type ${obj.type} not recognized`, obj);
    return undefined;
  }

  let baseArgs = t.args.map((arg) => arg).join(', ');
  // @todo: make sure this works for all input types, add validation
  let customArgs = obj.inputs.map((input) => `${input.type} ${input.name}`).join(', ');
  let args = `${baseArgs}${customArgs.length > 0 ? ', ' + customArgs : ''}`;

  let glslFunction = `
  ${t.returnType} ${obj.name}(${args}) {
      ${obj.glsl}
  }
`;

  // add extra input to beginning for backward combatibility @todo update compiler so this is no longer necessary
  if (obj.type === 'combine' || obj.type === 'combineCoord')
    obj.inputs.unshift({
      name: 'color',
      type: 'vec4',
    });

  return {
    ...obj,
    glsl: glslFunction,
  };
}

function createSourceClass() {
  return class extends GlslSource {};
}