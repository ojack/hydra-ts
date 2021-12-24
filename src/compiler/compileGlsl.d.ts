import { TransformApplication } from '../GlslSource';
import { TypedArg } from './formatArguments';
export interface ShaderParams {
    uniforms: TypedArg[];
    transformApplications: TransformApplication[];
    fragColor: string;
}
export declare function compileGlsl(transformApplications: TransformApplication[]): ShaderParams;