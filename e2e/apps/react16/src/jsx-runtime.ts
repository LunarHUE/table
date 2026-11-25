import { createElement, Fragment, type ElementType, type ReactNode } from "react";

// The JSX runtime for React 16.8, which ships none. The pages' JSX compiles
// to calls of these. Static children, from `jsxs`, go to `createElement` as
// separate arguments, so React doesn't take them for a list that needs keys.

type Props = Readonly<Record<string, unknown>> & { readonly children?: ReactNode };

export { Fragment };

const withKey = (props: Props, key: string | undefined): Props => (key === undefined ? props : { ...props, key });

export const jsx = (type: ElementType, props: Props, key?: string) => createElement(type, withKey(props, key));

const isList = (children: ReactNode): children is readonly ReactNode[] => Array.isArray(children);

export function jsxs(type: ElementType, props: Props, key?: string) {
  const { children, ...rest } = props;
  return isList(children) ? createElement(type, withKey(rest, key), ...children) : createElement(type, withKey(props, key));
}

export const jsxDEV = (type: ElementType, props: Props, key: string | undefined, isStatic: boolean) =>
  isStatic ? jsxs(type, props, key) : jsx(type, props, key);
