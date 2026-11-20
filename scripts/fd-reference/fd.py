import numpy as np, scipy.sparse as sp, scipy.sparse.linalg as spl, sys
ETA=376.730313
def solve(nx, ny, d, epsfn, cond):
    # nodes (i,j), x=i*d, y=j*d; cells eps at centres
    xc=(np.arange(nx-1)+0.5)*d; yc=(np.arange(ny-1)+0.5)*d
    X,Y=np.meshgrid(xc,yc,indexing='ij'); E=epsfn(X,Y)
    idx=np.arange(nx*ny).reshape(nx,ny)
    # horizontal edges (i,j)-(i+1,j): cells (i,j-1),(i,j)
    Ep=np.pad(E,((0,0),(1,1)),constant_values=0)  # zero outside (boundary edges are dirichlet anyway)
    eh=0.5*(Ep[:,:-1]+Ep[:,1:])  # shape nx-1, ny
    Eq=np.pad(E,((1,1),(0,0)),constant_values=0)
    ev=0.5*(Eq[:-1,:]+Eq[1:,:])  # shape nx, ny-1
    a=np.concatenate([idx[:-1,:].ravel(), idx[:,:-1].ravel()])
    b=np.concatenate([idx[1:,:].ravel(), idx[:,1:].ravel()])
    w=np.concatenate([eh.ravel(), ev.ravel()])
    N=nx*ny
    L=sp.coo_matrix((np.concatenate([w,w,-w,-w]),(np.concatenate([a,b,a,b]),np.concatenate([a,b,b,a]))),shape=(N,N)).tocsr()
    fixed=np.zeros(N,bool); val=np.zeros(N)
    B=np.zeros((nx,ny),bool); B[0,:]=B[-1,:]=B[:,0]=B[:,-1]=True
    fixed[idx[B]]=True
    xs=np.arange(nx)*d; ys=np.arange(ny)*d
    XN,YN=np.meshgrid(xs,ys,indexing='ij')
    for m,v in cond(XN,YN):
        fixed[idx[m]]=True; val[idx[m]]=v
    f=~fixed
    phi=val.copy()
    phi[f]=spl.spsolve(L[f][:,f].tocsc(), -L[f][:,fixed]@val[fixed])
    return phi@(L@phi)
def near(a,b,d): return np.abs(a-b)<d*0.5
def run(name, nx, ny, d, epsfn, conds, factor):
    out=[]
    for cond,fac in zip(conds,factor):
        C=solve(nx,ny,d,epsfn,cond)*fac
        Ca=solve(nx,ny,d,lambda X,Y:np.ones_like(X),cond)*fac
        out.append((ETA/np.sqrt(C*Ca), C/Ca))
    print(name, 'd=%g'%d, ' '.join('Z=%.3f ee=%.4f'%o for o in out)); sys.stdout.flush()
